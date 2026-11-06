-- The role enum currently has one value, so this allows exactly one admin.
CREATE UNIQUE INDEX "User_role_key" ON "User"("role");
