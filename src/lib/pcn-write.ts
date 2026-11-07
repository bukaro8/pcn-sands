export function buildPcnWriteData<T extends { registration: string }>(
  input: T,
  vehicleId: string,
  issuerId: string,
): Omit<T, "registration"> & { vehicleId: string; issuerId: string } {
  const { registration, ...data } = input;
  void registration;
  return { ...data, vehicleId, issuerId };
}
