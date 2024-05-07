import { expect } from 'chai'

import { getGnosisSafeProxyAddress } from '../../dist'

describe('getGnosisSafeProxyAddress', () => {
  it('[0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266], 1 threshold, 0 salt nonce', () => {
    const threshold = 1
    const saltNonce = 0
    const owners = ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266']
    const expectedSafeAddress = '0x6e667164e47986fF1108425153f32B02Fc2f5af2'
    const address = getGnosisSafeProxyAddress(owners, threshold, saltNonce)
    expect(address).to.eq(expectedSafeAddress)
  })

  it('[0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8], 1 threshold, 0 salt nonce', () => {
    const threshold = 1
    const saltNonce = 0
    const owners = [
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    ]
    const expectedSafeAddress = '0x2EF0Ec5214361b6160FE8B466c21c8dD8111Cb44'
    const address = getGnosisSafeProxyAddress(owners, threshold, saltNonce)
    expect(address).to.eq(expectedSafeAddress)
  })

  it('[0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8], 2 threshold, 1 salt nonce', () => {
    const threshold = 2
    const saltNonce = 1
    const owners = [
      '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    ]
    const expectedSafeAddress = '0x0f3A10a029d0D9F98Bf6402903bFDa808644434c'
    const address = getGnosisSafeProxyAddress(owners, threshold, saltNonce)
    expect(address).to.eq(expectedSafeAddress)
  })
})
