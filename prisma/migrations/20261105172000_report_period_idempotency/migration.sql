CREATE UNIQUE INDEX "ReportHistory_type_periodStart_periodEnd_key"
ON "ReportHistory"("type", "periodStart", "periodEnd");
