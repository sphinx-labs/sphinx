import { ethers } from 'ethers'

const findCollision = (): void => {
  const seenSelectors = new Map<string, string>()
  for (let i = 0; i < 100000; i++) {
    for (let j = 0; j < 2; j++) {
      const functionName = `f${i}${j === 0 ? '' : 'g'}`
      const signature = `${functionName}(uint256)`
      const hash = ethers.keccak256(ethers.toUtf8Bytes(signature))
      const selector = hash.slice(2, 10) // Skip '0x' prefix and take next 8 characters (4 bytes)

      if (seenSelectors.has(selector)) {
        console.log(
          `Collision found: ${signature} collides with ${seenSelectors.get(
            selector
          )}`
        )
        return
      }
      seenSelectors.set(selector, signature)
    }
  }
  console.log('No collision found in the given range.')
}

findCollision()
