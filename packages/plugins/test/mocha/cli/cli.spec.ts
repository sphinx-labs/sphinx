import sinon from 'sinon'
import chai from 'chai'

import { SphinxContext, makeSphinxContext } from '../../../src/cli/context'
import { makeCLI } from '../../../src/cli/setup'
import {
  BothNetworksSpecifiedError,
  ConfirmAndDryRunError,
  NoNetworkArgsError,
  getDuplicatedNetworkErrorMessage,
} from '../../../src/cli/utils'

const expect = chai.expect

describe('CLI Commands', () => {
  const scriptPath = 'path/to/Script.s.sol'

  let sphinxContext: SphinxContext
  let exitSpy: sinon.SinonStub
  let consoleErrorSpy: sinon.SinonStub

  beforeEach(() => {
    sphinxContext = makeSphinxContext()

    // Spy on process.exit before each test
    exitSpy = sinon.stub(process, 'exit')
    // Stub console.error to prevent Yargs from logging error messages
    consoleErrorSpy = sinon.stub(console, 'error')
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('propose', () => {
    let proposeSpy: sinon.SinonStub

    beforeEach(() => {
      proposeSpy = sinon.stub(sphinxContext, 'propose')
    })

    it('fails if no script path is included', async () => {
      const args = ['propose', '--networks', 'testnets']

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        'Not enough non-option arguments: got 0, need at least 1'
      )
    })

    it('fails if both --networks mainnets and --networks testnets are provided', () => {
      const args = [
        'propose',
        scriptPath,
        '--networks',
        'mainnets',
        '--networks',
        'testnets',
      ]

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        BothNetworksSpecifiedError
      )
    })

    it('fails if no --networks is provided', () => {
      const args = ['propose', scriptPath]

      makeCLI(args, sphinxContext)

      expect(proposeSpy.called).to.be.false
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        'Missing required argument: networks'
      )
    })

    it('fails if --networks has no args', () => {
      const args = ['propose', scriptPath, '--networks']

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(NoNetworkArgsError)
    })

    it('fails if a network name is duplicated', () => {
      const args = [
        'propose',
        scriptPath,
        '--networks',
        'ethereum',
        'optimism',
        'ethereum',
        'optimism',
      ]

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        getDuplicatedNetworkErrorMessage(['ethereum', 'optimism'])
      )
    })

    it('fails if both --confirm and --dry-run are specified', () => {
      const args = [
        'propose',
        scriptPath,
        '--confirm',
        '--dry-run',
        '--networks',
        'testnets',
      ]

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        ConfirmAndDryRunError
      )
    })

    it('--networks ethereum optimism arbitrum', () => {
      const args = [
        'propose',
        scriptPath,
        '--networks',
        'ethereum',
        'optimism',
        'arbitrum',
      ]

      makeCLI(args, sphinxContext)

      expect(proposeSpy.called).to.be.true

      const expectedParams = {
        confirm: false,
        networks: ['ethereum', 'optimism', 'arbitrum'],
        isDryRun: false,
        silent: false,
        scriptPath,
        sphinxContext: sinon.match.any,
        targetContract: undefined,
      }

      // Assert that the propose function was called with the correct object
      expect(proposeSpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--networks testnets', () => {
      const args = ['propose', scriptPath, '--networks', 'testnets']

      makeCLI(args, sphinxContext)

      expect(proposeSpy.called).to.be.true

      const expectedParams = {
        confirm: false,
        networks: ['testnets'],
        isDryRun: false,
        silent: false,
        scriptPath,
        sphinxContext: sinon.match.any,
        targetContract: undefined,
      }

      // Assert that the propose function was called with the correct object
      expect(proposeSpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--networks mainnets', () => {
      const args = ['propose', scriptPath, '--networks', 'mainnets']

      makeCLI(args, sphinxContext)

      const expectedParams = {
        confirm: false,
        networks: ['mainnets'],
        isDryRun: false,
        silent: false,
        scriptPath,
        sphinxContext: sinon.match.any,
        targetContract: undefined,
      }

      expect(proposeSpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--networks mainnets --confirm', () => {
      const args = [
        'propose',
        scriptPath,
        '--networks',
        'mainnets',
        '--confirm',
      ]

      makeCLI(args, sphinxContext)

      const expectedParams = {
        confirm: true, // confirm is true
        networks: ['mainnets'],
        isDryRun: false,
        silent: false,
        scriptPath,
        sphinxContext: sinon.match.any,
        targetContract: undefined,
      }

      expect(proposeSpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--networks mainnets --target-contract MyContract', () => {
      const args = [
        'propose',
        scriptPath,
        '--networks',
        'mainnets',
        '--target-contract',
        'MyContract',
      ]

      makeCLI(args, sphinxContext)

      const expectedParams = {
        confirm: false,
        networks: ['mainnets'],
        isDryRun: false,
        silent: false,
        scriptPath,
        sphinxContext: sinon.match.any,
        targetContract: 'MyContract', // Specified target contract
      }

      expect(proposeSpy.calledWithMatch(expectedParams)).to.be.true
    })
  })

  describe('deploy', () => {
    let deploySpy: sinon.SinonStub

    beforeEach(() => {
      deploySpy = sinon.stub(sphinxContext, 'deploy')
    })

    it('fails if no script path is included', async () => {
      const args = ['deploy', '--network', 'ethereum']

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        'Not enough non-option arguments: got 0, need at least 1'
      )
    })

    it('fails if no --network is provided', () => {
      const args = ['deploy', scriptPath]

      makeCLI(args, sphinxContext)

      expect(deploySpy.called).to.be.false
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        'Missing required argument: network'
      )
    })

    it('--network ethereum', () => {
      const network = 'ethereum'
      const args = ['deploy', scriptPath, '--network', network]

      makeCLI(args, sphinxContext)

      expect(deploySpy.called).to.be.true

      const expectedParams = {
        scriptPath,
        network,
        skipPreview: false,
        silent: false,
        sphinxContext: sinon.match.any,
        verify: false,
        targetContract: undefined,
      }

      expect(deploySpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--network ethereum --confirm', () => {
      const args = ['deploy', scriptPath, '--network', 'ethereum', '--confirm']

      makeCLI(args, sphinxContext)

      expect(deploySpy.called).to.be.true

      const expectedParams = {
        scriptPath,
        network: 'ethereum',
        skipPreview: true,
        silent: false,
        sphinxContext: sinon.match.any,
        verify: false,
        targetContract: undefined,
      }

      expect(deploySpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--network ethereum --target-contract MyContract', () => {
      const args = [
        'deploy',
        scriptPath,
        '--network',
        'ethereum',
        '--target-contract',
        'MyContract',
      ]

      makeCLI(args, sphinxContext)

      expect(deploySpy.called).to.be.true

      const expectedParams = {
        scriptPath,
        network: 'ethereum',
        skipPreview: false,
        silent: false,
        sphinxContext: sinon.match.any,
        verify: false,
        targetContract: 'MyContract',
      }

      expect(deploySpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--network ethereum --verify', () => {
      const args = ['deploy', scriptPath, '--network', 'ethereum', '--verify']

      makeCLI(args, sphinxContext)

      expect(deploySpy.called).to.be.true

      const expectedParams = {
        scriptPath,
        network: 'ethereum',
        skipPreview: false,
        silent: false,
        sphinxContext: sinon.match.any,
        verify: true,
        targetContract: undefined,
      }

      expect(deploySpy.calledWithMatch(expectedParams)).to.be.true
    })

    it('--network ethereum --silent', () => {
      const args = ['deploy', scriptPath, '--network', 'ethereum', '--silent']

      makeCLI(args, sphinxContext)

      expect(deploySpy.called).to.be.true

      const expectedParams = {
        scriptPath,
        network: 'ethereum',
        skipPreview: false,
        silent: true,
        sphinxContext: sinon.match.any,
        verify: false,
        targetContract: undefined,
      }

      expect(deploySpy.calledWithMatch(expectedParams)).to.be.true
    })
  })

  describe('artifacts', () => {
    let fetchArtifactsSpy: sinon.SinonStub

    beforeEach(() => {
      fetchArtifactsSpy = sinon.stub(sphinxContext, 'fetchRemoteArtifacts')
    })

    it('fails if no org-id defined', async () => {
      const args = ['artifacts', '--project-name', 'test_project']

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        'Missing required argument: org-id'
      )
    })

    it('fails if no project-name defined', async () => {
      const args = ['artifacts', '--org-id', 'test_id']

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        'Missing required argument: project-name'
      )
    })

    it('fails if neither defined', async () => {
      const args = ['artifacts']

      makeCLI(args, sphinxContext)

      expect(exitSpy.calledWith(1)).to.be.true
      expect(consoleErrorSpy.called).to.be.true
      expect(consoleErrorSpy.firstCall.args[0]).to.include(
        'Missing required arguments: org-id, project-name'
      )
    })

    it('succeeds with both defined', async () => {
      const projectName = 'my_project'
      const orgId = 'test_id'
      const args = [
        'artifacts',
        '--org-id',
        orgId,
        '--project-name',
        projectName,
        '--silent',
      ]

      makeCLI(args, sphinxContext)

      expect(fetchArtifactsSpy.called).to.be.true

      expect(
        fetchArtifactsSpy.calledWithMatch({
          apiKey: process.env.SPHINX_API_KEY,
          orgId,
          projectName,
          silent: true, // silent
        })
      ).to.be.true
    })
  })
})
