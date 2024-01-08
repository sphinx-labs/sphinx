#!/usr/bin/env node
import * as dotenv from 'dotenv'

import { makeCLI } from './setup'

// Load environment variables from .env
dotenv.config()

makeCLI()
