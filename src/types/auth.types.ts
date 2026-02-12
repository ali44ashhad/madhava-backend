
export interface OtpPayload {
    customerId: string;
    phone: string;
}

export interface AccessTokenPayload {
    customerId: string;
    role: 'CUSTOMER';
    iat: number;
    exp: number;
}

export interface RefreshTokenPayload {
    customerId: string;
    jti: string; // unique identifier for the token
}

export interface CustomerAuthResponse {
    accessToken: string;
    customer: {
        id: string;
        phone: string;
        name: string;
        email: string;
    };
}
