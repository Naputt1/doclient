package __PACKAGE_NAME__

type AuthService interface {
	// Define auth methods here
}

type AuthServiceOp[T any] struct {
	client *Client[T]
}

func NewAuthServiceOp[T any](client *Client[T]) *AuthServiceOp[T] {
	return &AuthServiceOp[T]{client: client}
}
