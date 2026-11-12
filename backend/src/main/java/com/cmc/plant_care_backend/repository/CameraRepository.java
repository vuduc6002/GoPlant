package com.cmc.plant_care_backend.repository;

import com.cmc.plant_care_backend.model.Camera;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface CameraRepository extends JpaRepository<Camera, UUID> {

    List<Camera> findByGardenIdAndOwnerIdOrderByCreatedAtAscIdAsc(UUID gardenId, UUID ownerId);
}
