package __PACKAGE_NAME__

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	UserAgent = "__PACKAGE_NAME__/1.0.0"

	defaultHttpTimeout = 10
)

var regionURLs = map[string]string{
	"SG":   "https://api.lazada.sg/rest",
	"MY":   "https://api.lazada.com.my/rest",
	"VN":   "https://api.lazada.vn/rest",
	"TH":   "https://api.lazada.co.th/rest",
	"PH":   "https://api.lazada.com.ph/rest",
	"ID":   "https://api.lazada.co.id/rest",
	"AUTH": "https://auth.lazada.com/rest",
}

type App struct {
	AppKey    string
	AppSecret string
}

type Client[T any] struct {
	mu     sync.Mutex
	Client *http.Client
	log    LeveledLoggerInterface

	App    App
	Region string

	Token        string
	RefreshToken string

	retries  int
	attempts int

	OnTokenRefresh func(res *RefreshAccessTokenResponse, meta T)
	Meta           T

	// @SERVICES_SECTION
}

type DefaultClient = Client[any]

func NewClient[T any](app App, opts ...Option[T]) *Client[T] {
	c := &Client[T]{
		Client: &http.Client{Timeout: time.Duration(defaultHttpTimeout) * time.Second},
		log:    &LeveledLogger{},
		App:    app,
		Region: "SG",
	}

	// @SERVICES_INIT_SECTION

	for _, opt := range opts {
		opt(c)
	}

	return c
}

func NewDefaultClient(app App, opts ...DefaultOption) *DefaultClient {
	return NewClient(app, opts...)
}

func (c *Client[T]) getServerURL() string {
	if u, ok := regionURLs[c.Region]; ok {
		return u
	}
	return regionURLs["SG"]
}

func (c *Client[T]) sign(path string, sysParams, apiParams map[string]string) string {
	keys := make([]string, 0, len(sysParams)+len(apiParams))
	for k := range sysParams {
		keys = append(keys, k)
	}
	for k := range apiParams {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var buf bytes.Buffer
	buf.WriteString(path)
	for _, k := range keys {
		v := ""
		if val, ok := sysParams[k]; ok {
			v = val
		} else if val, ok := apiParams[k]; ok {
			v = val
		}
		buf.WriteString(k)
		buf.WriteString(v)
	}

	mac := hmac.New(sha256.New, []byte(c.App.AppSecret))
	mac.Write(buf.Bytes())
	return strings.ToUpper(hex.EncodeToString(mac.Sum(nil)))
}

type responseWrapper struct {
	Code      string          `json:"code"`
	Type      string          `json:"type"`
	Message   string          `json:"message"`
	RequestID string          `json:"request_id"`
	Data      json.RawMessage `json:"data"`
}

type ResponseError struct {
	Status    int
	Code      string
	Type      string
	Message   string
	RequestID string
}

func (e ResponseError) Error() string {
	return fmt.Sprintf("lazada error %s: %s (request_id: %s)", e.Code, e.Message, e.RequestID)
}

func (c *Client[T]) execute(ctx context.Context, method, path string, apiParams map[string]string, fileParams map[string][]byte) (*responseWrapper, error) {
	sysParams := map[string]string{
		"app_key":     c.App.AppKey,
		"sign_method": "sha256",
		"timestamp":   fmt.Sprintf("%d000", time.Now().Unix()),
		"partner_id":  "__PACKAGE_NAME__/1.0.0",
	}
	if c.Token != "" {
		sysParams["access_token"] = c.Token
	}

	sign := c.sign(path, sysParams, apiParams)

	values := url.Values{}
	for k, v := range sysParams {
		values.Set(k, v)
	}
	for k, v := range apiParams {
		values.Set(k, v)
	}
	values.Set("sign", sign)

	serverURL := c.getServerURL()
	fullURL := fmt.Sprintf("%s%s?%s", serverURL, path, values.Encode())

	var req *http.Request
	var err error

	if method == "POST" {
		body := &bytes.Buffer{}
		writer := multipart.NewWriter(body)
		if len(fileParams) > 0 {
			for key, data := range fileParams {
				part, err := writer.CreateFormFile("image", key)
				if err != nil {
					return nil, err
				}
				if _, err := part.Write(data); err != nil {
					return nil, err
				}
			}
		}
		for k, v := range apiParams {
			if err := writer.WriteField(k, v); err != nil {
				return nil, err
			}
		}
		if err := writer.Close(); err != nil {
			return nil, err
		}
		req, err = http.NewRequestWithContext(ctx, method, fullURL, body)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Content-Type", writer.FormDataContentType())
	} else {
		req, err = http.NewRequestWithContext(ctx, method, fullURL, nil)
		if err != nil {
			return nil, err
		}
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", UserAgent)

	c.log.Debugf("%s %s", method, fullURL)

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	wrapper := &responseWrapper{}
	if err := json.Unmarshal(bodyBytes, wrapper); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if wrapper.Code != "0" && wrapper.Code != "" {
		return wrapper, ResponseError{
			Status:    resp.StatusCode,
			Code:      wrapper.Code,
			Type:      wrapper.Type,
			Message:   wrapper.Message,
			RequestID: wrapper.RequestID,
		}
	}

	return wrapper, nil
}

func (c *Client[T]) Get(ctx context.Context, path string, params map[string]string) (*responseWrapper, error) {
	return c.execute(ctx, "GET", path, params, nil)
}

func (c *Client[T]) Post(ctx context.Context, path string, params map[string]string, files map[string][]byte) (*responseWrapper, error) {
	return c.execute(ctx, "POST", path, params, files)
}

func paramsFromStruct(v interface{}) map[string]string {
	params := make(map[string]string)
	if v == nil {
		return params
	}
	data, err := json.Marshal(v)
	if err != nil {
		return params
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return params
	}
	for k, val := range raw {
		if val == nil {
			continue
		}
		switch vv := val.(type) {
		case string:
			params[k] = vv
		case float64:
			if vv == float64(int64(vv)) {
				params[k] = strconv.FormatInt(int64(vv), 10)
			} else {
				params[k] = strconv.FormatFloat(vv, 'f', -1, 64)
			}
		case bool:
			params[k] = strconv.FormatBool(vv)
		default:
			b, _ := json.Marshal(vv)
			params[k] = string(b)
		}
	}
	return params
}
