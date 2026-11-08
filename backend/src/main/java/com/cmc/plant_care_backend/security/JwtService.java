package com.cmc.plant_care_backend.security;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);
    private static final int MIN_KEY_BYTES = 32; // 256 bits minimum for HMAC-SHA256

    private final byte[] secretKeyBytes;
    private final long expirationMs;

    public JwtService(
        @Value("${jwt.secret-base64:}") String secretBase64,
        @Value("${jwt.expiration-ms:86400000}") long expirationMs
    ) {
        if (expirationMs <= 0) {
            throw new IllegalArgumentException("JWT expiration-ms must be a positive integer greater than 0. Provided: " + expirationMs);
        }
        this.expirationMs = expirationMs;

        if (secretBase64 == null || secretBase64.trim().isEmpty()) {
            throw new IllegalStateException("JWT secret is not configured. Please set the JWT_SECRET_BASE64 environment variable.");
        }

        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(secretBase64.trim());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("JWT secret must be a valid Base64 encoded string: " + e.getMessage(), e);
        }

        if (decoded.length < MIN_KEY_BYTES) {
            throw new IllegalArgumentException(String.format(
                "JWT secret key must be at least 256 bits (%d bytes). Current key is %d bits (%d bytes).",
                MIN_KEY_BYTES, decoded.length * 8, decoded.length
            ));
        }

        this.secretKeyBytes = decoded;
    }

    public String generateToken(UserPrincipal principal) {
        try {
            JWSSigner signer = new MACSigner(secretKeyBytes);

            List<String> roles = principal.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .collect(Collectors.toList());

            Date now = new Date();
            Date expiryDate = new Date(now.getTime() + expirationMs);

            JWTClaimsSet claimsSet = new JWTClaimsSet.Builder()
                .subject(principal.getId().toString())
                .claim("email", principal.getEmail())
                .claim("phone", principal.getPhoneNumber())
                .claim("roles", roles)
                .issueTime(now)
                .expirationTime(expiryDate)
                .build();

            SignedJWT signedJWT = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claimsSet);
            signedJWT.sign(signer);

            return signedJWT.serialize();
        } catch (Exception e) {
            log.error("Error generating JWT token", e);
            throw new RuntimeException("Could not generate JWT token", e);
        }
    }

    public boolean validateToken(String token) {
        if (token == null || token.trim().isEmpty()) {
            return false;
        }
        try {
            SignedJWT signedJWT = SignedJWT.parse(token);
            JWSVerifier verifier = new MACVerifier(secretKeyBytes);
            if (!signedJWT.verify(verifier)) {
                log.warn("JWT signature verification failed");
                return false;
            }

            Date expiration = signedJWT.getJWTClaimsSet().getExpirationTime();
            if (expiration == null || expiration.before(new Date())) {
                log.warn("JWT token has expired");
                return false;
            }

            return true;
        } catch (Exception e) {
            log.warn("Invalid JWT token: {}", e.getMessage());
            return false;
        }
    }

    public UUID extractUserId(String token) {
        try {
            SignedJWT signedJWT = SignedJWT.parse(token);
            String subject = signedJWT.getJWTClaimsSet().getSubject();
            return UUID.fromString(subject);
        } catch (Exception e) {
            log.warn("Could not extract user ID from token: {}", e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    public List<String> extractRoles(String token) {
        try {
            SignedJWT signedJWT = SignedJWT.parse(token);
            Object roles = signedJWT.getJWTClaimsSet().getClaim("roles");
            if (roles instanceof List<?>) {
                return (List<String>) roles;
            }
            return Collections.emptyList();
        } catch (Exception e) {
            return Collections.emptyList();
        }
    }

    public long getExpirationInSeconds() {
        return expirationMs / 1000;
    }
}
