package com.cmc.plant_care_backend.model;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "user_favorite_species")
@IdClass(UserFavoriteSpeciesId.class)
public class UserFavoriteSpecies {

    @Id
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Id
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "species_id", nullable = false)
    private PlantSpecies species;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt;

    public UserFavoriteSpecies() {}

    public UserFavoriteSpecies(User user, PlantSpecies species) {
        this.user = user;
        this.species = species;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = OffsetDateTime.now();
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public PlantSpecies getSpecies() {
        return species;
    }

    public void setSpecies(PlantSpecies species) {
        this.species = species;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
