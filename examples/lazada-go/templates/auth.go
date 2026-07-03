package __PACKAGE_NAME__

import (
	"context"
	"encoding/json"
)

type AuthService interface {
	GetAccessToken(ctx context.Context, code string) (*AccessTokenResponse, error)
	RefreshAccessToken(ctx context.Context, refreshToken string) (*RefreshAccessTokenResponse, error)
}

type AccessTokenResponse struct {
	BaseResponse

	AccessToken  string   `json:"access_token"`
	RefreshToken string   `json:"refresh_token"`
	ExpireIn     int      `json:"expire_in"`
	Account      string   `json:"account"`
	AccountID    string   `json:"account_id"`
	Country      string   `json:"country"`
	SellerID     []string `json:"seller_id"`
}

type RefreshAccessTokenResponse struct {
	BaseResponse

	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpireIn     int    `json:"expire_in"`
}

type AuthServiceOp[T any] struct {
	client *Client[T]
}

func (s *AuthServiceOp[T]) GetAccessToken(ctx context.Context, code string) (*AccessTokenResponse, error) {
	path := "/auth/token/get"
	params := map[string]string{
		"code": code,
	}
	wrapper, err := s.client.Get(ctx, path, params)
	if err != nil {
		return nil, err
	}
	resp := &AccessTokenResponse{}
	if err := parseResponse(wrapper, resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func (s *AuthServiceOp[T]) RefreshAccessToken(ctx context.Context, refreshToken string) (*RefreshAccessTokenResponse, error) {
	path := "/auth/token/refresh"
	params := map[string]string{
		"refresh_token": refreshToken,
	}
	wrapper, err := s.client.Get(ctx, path, params)
	if err != nil {
		return nil, err
	}
	resp := &RefreshAccessTokenResponse{}
	if err := parseResponse(wrapper, resp); err != nil {
		return nil, err
	}
	return resp, nil
}

func parseResponse[T any](wrapper *responseWrapper, resp *T) error {
	data := wrapper.Data
	if len(data) > 0 && string(data) != "null" {
		if err := json.Unmarshal(data, resp); err != nil {
			return err
		}
	}
	return nil
}
