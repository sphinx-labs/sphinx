export const contractsExceedSizeLimitErrorMessage = (
  contracts: Array<{ address: string; fullyQualifiedName?: string }>
): string => {
  const contractLines = contracts
    .map((contract) => {
      let line = `- `
      if (contract.fullyQualifiedName) {
        line += `${contract.fullyQualifiedName} at `
      }
      line += `${contract.address}`
      if (!contract.fullyQualifiedName) {
        line += ' (unlabeled)'
      }
      return line
    })
    .join('\n')

  return (
    `The following contracts are over the contract size limit (24,576 bytes), which means they\n` +
    `cannot be deployed on live networks:\n${contractLines}`
  )
}
