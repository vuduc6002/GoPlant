package com.cmc.plant_care_backend.model;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

public class UserFavoriteSpeciesId implements Serializable {

    private UUID user;
    private UUID species;

    public UserFavoriteSpeciesId() {}

    public UserFavoriteSpeciesId(UUID user, UUID species) {
        this.user = user;
        this.species = species;
    }

    public UUID getUser() {
        return user;
    }

    public void setUser(UUID user) {
        this.user = user;
    }

    public UUID getSpecies() {
        return species;
    }

    public void setSpecies(UUID species) {
        this.species = species;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        UserFavoriteSpeciesId that = (UserFavoriteSpeciesId) o;
        return Objects.equals(user, that.user) && Objects.equals(species, that.species);
    }

    @Override
    public int hashCode() {
        return Objects.hash(user, species);
    }
}
