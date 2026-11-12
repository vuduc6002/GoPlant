package com.cmc.plant_care_backend.dto.monitoring;

public class SpeciesCareGuideDto {

    private String lightRequirement;
    private String waterRequirement;
    private String wateringFrequency;
    private String temperatureRange;
    private String humidityRange;
    private String soilPh;
    private String usageAndCaution;

    public SpeciesCareGuideDto() {}

    public String getLightRequirement() {
        return lightRequirement;
    }

    public void setLightRequirement(String lightRequirement) {
        this.lightRequirement = lightRequirement;
    }

    public String getWaterRequirement() {
        return waterRequirement;
    }

    public void setWaterRequirement(String waterRequirement) {
        this.waterRequirement = waterRequirement;
    }

    public String getWateringFrequency() {
        return wateringFrequency;
    }

    public void setWateringFrequency(String wateringFrequency) {
        this.wateringFrequency = wateringFrequency;
    }

    public String getTemperatureRange() {
        return temperatureRange;
    }

    public void setTemperatureRange(String temperatureRange) {
        this.temperatureRange = temperatureRange;
    }

    public String getHumidityRange() {
        return humidityRange;
    }

    public void setHumidityRange(String humidityRange) {
        this.humidityRange = humidityRange;
    }

    public String getSoilPh() {
        return soilPh;
    }

    public void setSoilPh(String soilPh) {
        this.soilPh = soilPh;
    }

    public String getUsageAndCaution() {
        return usageAndCaution;
    }

    public void setUsageAndCaution(String usageAndCaution) {
        this.usageAndCaution = usageAndCaution;
    }
}
