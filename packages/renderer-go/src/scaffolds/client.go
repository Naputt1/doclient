package __PACKAGE_NAME__

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

const (
	UserAgent          = "__PACKAGE_NAME__/1.0.0"
	defaultHttpTimeout = 10
)

type App struct {
	// Platform-specific credentials
}

type Client[T any] struct {
	mu     sync.Mutex
	client *http.Client
	log    LeveledLoggerInterface

	// @SERVICES_SECTION
}

type DefaultClient = Client[any]

func NewClient[T any](app App, opts ...Option[T]) *Client[T] {
	c := &Client[T]{
		client: &http.Client{Timeout: time.Duration(defaultHttpTimeout) * time.Second},
		log:    &LeveledLogger{},
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

type ResponseError struct {
	Status      int
	Message     string
	RequestID   string
}

func (e ResponseError) Error() string {
	return fmt.Sprintf("error %d: %s", e.Status, e.Message)
}

func (c *Client[T]) do(ctx context.Context, method, path string, body, result interface{}) error {
	var reqBody io.Reader
	if body != nil {
		js, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewBuffer(js)
	}

	req, err := http.NewRequestWithContext(ctx, method, path, reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", UserAgent)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		rbody, _ := io.ReadAll(resp.Body)
		return ResponseError{
			Status:  resp.StatusCode,
			Message: string(rbody),
		}
	}

	if result != nil {
		return json.NewDecoder(resp.Body).Decode(result)
	}

	return nil
}

func (c *Client[T]) Get(ctx context.Context, path string, result interface{}) error {
	return c.do(ctx, "GET", path, nil, result)
}

func (c *Client[T]) Post(ctx context.Context, path string, body, result interface{}) error {
	return c.do(ctx, "POST", path, body, result)
}

func (c *Client[T]) Put(ctx context.Context, path string, body, result interface{}) error {
	return c.do(ctx, "PUT", path, body, result)
}

func (c *Client[T]) Delete(ctx context.Context, path string) error {
	return c.do(ctx, "DELETE", path, nil, nil)
}
