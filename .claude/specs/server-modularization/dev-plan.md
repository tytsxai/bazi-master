# Server Modularization - Development Plan

## Overview
Refactor the monolithic `backend/server.js` (5700+ lines) into a modular architecture.

## Task Breakdown

### Phase 0: Constants (No Dependencies - Parallel)

#### Task 1: Extract BaZi Constants Module
- **ID**: task-1
- **Backend**: codex
- **Description**: Extract STEMS_MAP, BRANCHES_MAP, ELEMENTS
- **File Scope**: backend/constants/stems.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

#### Task 2: Extract Zodiac Constants Module
- **ID**: task-2
- **Backend**: codex
- **Description**: Extract ZODIAC_SIGNS, ZODIAC_PERIODS
- **File Scope**: backend/constants/zodiac.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

#### Task 3: Extract Ziwei Constants Module
- **ID**: task-3
- **Backend**: codex
- **Description**: Extract ZIWEI_PALACES, ZIWEI_MAJOR_STARS
- **File Scope**: backend/constants/ziwei.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

### Phase 1: Services (Depends on Phase 0)

#### Task 4: Extract AI Service Module
- **ID**: task-4
- **Backend**: codex
- **Description**: Extract callOpenAI, callAnthropic, generateAIContent
- **File Scope**: backend/services/ai.service.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

#### Task 5: Extract Prompts Service Module
- **ID**: task-5
- **Backend**: codex
- **Description**: Extract buildBaziPrompt, buildZiweiPrompt
- **File Scope**: backend/services/prompts.service.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

#### Task 6: Extract BaZi Service Module
- **ID**: task-6
- **Backend**: codex
- **Description**: Extract performCalculation, getBaziCalculation
- **File Scope**: backend/services/bazi.service.js
- **Dependencies**: task-1
- **Test Command**: cd backend && npm test

#### Task 7: Extract Ziwei Service Module
- **ID**: task-7
- **Backend**: codex
- **Description**: Extract calculateZiweiChart
- **File Scope**: backend/services/ziwei.service.js
- **Dependencies**: task-1, task-3
- **Test Command**: cd backend && npm test

#### Task 8: Extract Zodiac Service Module
- **ID**: task-8
- **Backend**: codex
- **Description**: Extract buildHoroscope, buildZodiacCompatibility
- **File Scope**: backend/services/zodiac.service.js
- **Dependencies**: task-2
- **Test Command**: cd backend && npm test

#### Task 9: Extract Soft Delete Service
- **ID**: task-9
- **Backend**: codex
- **Description**: Extract soft delete logic
- **File Scope**: backend/services/softDelete.service.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

#### Task 10: Extract OAuth Service
- **ID**: task-10
- **Backend**: codex
- **Description**: Extract OAuth state management
- **File Scope**: backend/services/oauth.service.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

#### Task 11: Extract Schema Service
- **ID**: task-11
- **Backend**: codex
- **Description**: Extract table initialization
- **File Scope**: backend/services/schema.service.js
- **Dependencies**: None
- **Test Command**: cd backend && npm test

### Phase 2: Middleware (Parallel)

#### Task 12: Extract CORS Middleware
- **ID**: task-12
- **Backend**: codex
- **File Scope**: backend/middleware/cors.middleware.js
- **Dependencies**: None

#### Task 13: Extract Rate Limit Middleware
- **ID**: task-13
- **Backend**: codex
- **File Scope**: backend/middleware/rateLimit.middleware.js
- **Dependencies**: None

#### Task 14-16: Extract Other Middleware
- **ID**: task-14,15,16
- **Backend**: codex
- **File Scope**: backend/middleware/*.middleware.js
- **Dependencies**: None

### Phase 3: Controllers (Depends on Phase 1)

#### Task 17-24: Extract Controllers
- auth.controller.js (task-17)
- user.controller.js (task-18)
- bazi.controller.js (task-19)
- ziwei.controller.js (task-20)
- zodiac.controller.js (task-21)
- tarot.controller.js (task-22)
- iching.controller.js (task-23)
- favorites.controller.js (task-24)

### Phase 4: Routes (Depends on Phase 3)

#### Task 25-33: Extract Routes
- auth.routes.js, bazi.routes.js, ziwei.routes.js
- zodiac.routes.js, tarot.routes.js, iching.routes.js
- user.routes.js, admin.routes.js, routes/index.js

### Phase 5: Core Assembly

#### Task 34: Create app.js
#### Task 35: Extract WebSocket handler
#### Task 36: Refactor server.js (<100 lines)

## Acceptance Criteria
- server.js < 100 lines
- All tests pass
- Coverage >= 90%
