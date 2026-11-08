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

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class JwtService {

    private static final Logger log = LoggerFactory.getLogger(JwtService.class);

    // Fallback secret for local dev/testing: 256-bit key
    private static final String DEFAULT_DEV_SECRET = "goplant-secure-jwt-signing-secret-key-must-be-at-least-256-bits-long-2026!";

    private final byte[] secretKeyBytes;
    private final long expirationMs;

    public JwtService(
        @Value("${jwt.secret-base64:}") String secretBase64,
        @Value("${jwt.expiration-ms:86400000}") long expirationMs
    ) {
        this.expirationMs = expirationMs;
        if (secretBase64 != null && !secretBase64.trim().isEmpty()) {
            byte[] decoded;
            try {
                decoded = Base64.getDecoder().decode(secretBase64.trim());
                if (decoded.length < 32) {
                    log.warn("JWT secret is shorter than 256 bits, padding for HMAC-SHA256.");
                    decoded = Arrays.copyOf(decoded, 32);
                }
            } catch (IllegalArgumentException e) {
                log.warn("Invalid Base64 in jwt.secret-base64, using raw bytes.");
                decoded = secretBase64.getBytes(StandardCharsets.UTF_8);
                if (decoded.length < 32) {
                    decoded = Arrays.copyOf(decoded, 32);
                }
            }
            this.secretKeyBytes = decoded;
        } else {
            this.secretKeyBytes = DEFAULT_DEV_SECRET.getBytes(StandardCharsets.UTF_8);
        }
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
