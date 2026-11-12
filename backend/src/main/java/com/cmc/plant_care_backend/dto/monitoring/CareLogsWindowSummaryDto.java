package com.cmc.plant_care_backend.dto.monitoring;

public class CareLogsWindowSummaryDto {

    private int unlinkedCompletedLogs;
    private int unlinkedSkippedLogs;
    private int linkedScheduledCompletedLogs;
    private int linkedScheduledSkippedLogs;

    public CareLogsWindowSummaryDto() {}

    public CareLogsWindowSummaryDto(
        int unlinkedCompletedLogs,
        int unlinkedSkippedLogs,
        int linkedScheduledCompletedLogs,
        int linkedScheduledSkippedLogs
    ) {
        this.unlinkedCompletedLogs = unlinkedCompletedLogs;
        this.unlinkedSkippedLogs = unlinkedSkippedLogs;
        this.linkedScheduledCompletedLogs = linkedScheduledCompletedLogs;
        this.linkedScheduledSkippedLogs = linkedScheduledSkippedLogs;
    }

    public int getUnlinkedCompletedLogs() {
        return unlinkedCompletedLogs;
    }

    public void setUnlinkedCompletedLogs(int unlinkedCompletedLogs) {
        this.unlinkedCompletedLogs = unlinkedCompletedLogs;
    }

    public int getUnlinkedSkippedLogs() {
        return unlinkedSkippedLogs;
    }

    public void setUnlinkedSkippedLogs(int unlinkedSkippedLogs) {
        this.unlinkedSkippedLogs = unlinkedSkippedLogs;
    }

    public int getLinkedScheduledCompletedLogs() {
        return linkedScheduledCompletedLogs;
    }

    public void setLinkedScheduledCompletedLogs(int linkedScheduledCompletedLogs) {
        this.linkedScheduledCompletedLogs = linkedScheduledCompletedLogs;
    }

    public int getLinkedScheduledSkippedLogs() {
        return linkedScheduledSkippedLogs;
    }

    public void setLinkedScheduledSkippedLogs(int linkedScheduledSkippedLogs) {
        this.linkedScheduledSkippedLogs = linkedScheduledSkippedLogs;
    }
}
