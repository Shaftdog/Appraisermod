# Order UI Shell - Professional Appraisal Management

## Overview

Order UI Shell is a comprehensive React-based application designed for managing professional appraisal orders. The system provides a tabbed navigation interface with status tracking, sign-off workflows, and version comparison capabilities. Built with modern web technologies, it features a responsive design that adapts to both desktop and mobile environments.

The application serves as a complete workflow management tool for appraisal professionals, offering specialized tabs for different aspects of the appraisal process including order summary, subject property details, market analysis, comparables, sketches, photos, cost analysis, reconciliation, quality control with sign-offs, and export functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## Integration Notes

- **GitHub Integration**: Manual push preferred - user will handle GitHub repository sync to https://github.com/Shaftdog/Appraisermod manually rather than using Replit's GitHub connector.

## System Architecture

### Frontend Architecture
The application uses a modern React-based stack with TypeScript for type safety. The architecture follows a component-based design pattern with clear separation of concerns:

**UI Framework**: Built with React 18+ and TypeScript, utilizing functional components with hooks for state management. The component library is based on Radix UI primitives with shadcn/ui styling for consistent, accessible design patterns.

**Routing**: Implements wouter for lightweight client-side routing, handling navigation between different order tabs and sections.

**State Management**: Uses React Query (@tanstack/react-query) for server state management, providing caching, synchronization, and error handling for API calls. Local state is managed through React hooks.

**Styling**: Tailwind CSS provides utility-first styling with a custom design system. CSS variables enable theme customization with support for light/dark modes.

### Backend Architecture
The backend follows a RESTful API design using Express.js with TypeScript:

**Server Framework**: Express.js provides the web server foundation with middleware for JSON parsing, CORS handling, and request logging.

**API Design**: RESTful endpoints for order management, tab operations, version control, and sign-off workflows. API routes follow REST conventions with proper HTTP status codes.

**Request Handling**: Middleware-based architecture for request processing, error handling, and response formatting.

### Data Storage Solutions
The application uses a hybrid approach for data persistence:

**Database**: PostgreSQL with Drizzle ORM for type-safe database operations. Schema definitions use Drizzle's declarative approach with proper relationships and constraints.

**Development Storage**: In-memory storage implementation for development and testing, with file-based persistence for sample data.

**Data Models**: Structured schema for orders, users, versions, and tab states with proper typing and validation using Zod schemas.

### Authentication and Authorization
Currently implements a basic authentication structure ready for extension:

**User Management**: User model with username/password authentication structure in place.

**Session Handling**: Infrastructure for session management using Express sessions with PostgreSQL storage.

**Authorization**: Prepared for role-based access control with user context in API operations.

### Key Design Patterns
**Component Composition**: Reusable UI components built with Radix UI primitives, allowing for consistent behavior and accessibility across the application.

**Status Aggregation**: Implements a Red/Yellow/Green (RYG) status system that aggregates tab-level statuses into overall order status, providing quick visual feedback.

**Version Control**: Built-in versioning system for tracking changes across different tabs with diff viewing capabilities using the 'diff' library.

**Mobile-First Responsive Design**: Adaptive layout that collapses navigation on mobile devices while maintaining full functionality.

**Accessibility**: WCAG AA compliant design with proper ARIA labels, keyboard navigation, and screen reader support.

### Development Workflow
**Build System**: Vite for fast development builds and hot module replacement, with esbuild for production builds.

**Type Safety**: Full TypeScript coverage with strict typing enabled, shared types between frontend and backend.

**Code Quality**: ESLint and TypeScript compiler checks ensure code quality and consistency.

## External Dependencies

### Core Framework Dependencies
- **React 18+**: Frontend framework with concurrent features
- **Vite**: Build tool and development server with HMR
- **TypeScript**: Type safety across the entire application
- **Express.js**: Backend web framework

### UI and Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Unstyled, accessible UI primitives
- **shadcn/ui**: Pre-built component library based on Radix UI
- **Lucide React**: Icon library for consistent iconography
- **class-variance-authority**: Type-safe variant handling for components

### Data Management
- **@tanstack/react-query**: Server state management and caching
- **Drizzle ORM**: Type-safe database toolkit
- **@neondatabase/serverless**: PostgreSQL connection for serverless environments
- **Zod**: Runtime type validation and schema definition

### Development and Build Tools
- **wouter**: Lightweight routing library
- **date-fns**: Date manipulation and formatting
- **diff**: Text comparison and diffing functionality
- **react-hook-form**: Form state management with validation
- **@hookform/resolvers**: Form validation resolvers

### Database and Session Management
- **connect-pg-simple**: PostgreSQL session store for Express
- **PostgreSQL**: Primary database for production data storage

### Mobile and Responsive Design
- **@radix-ui/react-***: Complete suite of accessible UI primitives
- **Custom mobile detection hooks**: Device-specific responsive behavior

### Mapping and Geospatial
- **Leaflet**: Open-source JavaScript library for interactive maps
- **react-leaflet**: React components for Leaflet maps (v4.2.1 for React 18 compatibility)
- **leaflet-draw**: Drawing and editing tools for Leaflet polygons and shapes
- **@turf/turf**: Geospatial analysis library for point-in-polygon operations and calculations

The architecture is designed to be modular and scalable, with clear separation between frontend and backend concerns, making it easy to extend functionality and integrate with additional services as needed.

## Recent Changes

### October 13, 2025 - Routing and CSRF Fixes

**Enhanced Market Analysis Routing Fix:**
- **Issue**: Clicking "Enhanced Market Analysis" button redirected back to order page instead of opening enhanced market analysis
- **Root Cause**: Route `/orders/:orderId/market-enhanced` was not registered in App.tsx, causing wouter to fall back to the generic `:tab?` route which OrderPage didn't know how to handle
- **Solution**: 
  - Added specific route for market-enhanced page in App.tsx before the generic tab route (order matters in wouter)
  - Fixed syntax error in market-enhanced.tsx (variable name had a space)
  - Navigation now works correctly: Market tab ↔ Enhanced Market Analysis
- **Files Modified**: client/src/App.tsx, client/src/pages/orders/[orderId]/market-enhanced.tsx

**API Request Parameter Fix:**
- **Issue**: Submarket save failing with "is not a valid HTTP method" error - apiRequest calls using wrong parameter order
- **Root Cause**: Code was calling `apiRequest(url, options)` (fetch-style) instead of correct `apiRequest(method, url, data)` signature
- **Solution**: Fixed all mutation apiRequest calls in market-enhanced.tsx to use correct parameter order
- **Files Modified**: client/src/pages/orders/[orderId]/market-enhanced.tsx (lines 82, 107, 128, 153)

**CSRF Origin Fix for ATTOM Integration:**
- **Issue**: ATTOM property lookup was failing with 403 "Bad origin" error because Replit serves apps from multiple domains (workspace.*.repl.co and auto-generated *.replit.dev domains), but CSRF protection only allowed exact origin match
- **Solution**: Updated `requireSameOrigin` middleware in server/routes.ts to accept all valid Replit domains (*.repl.co, *.replit.dev, *.replit.app) while maintaining security
- **Files Modified**: server/routes.ts (lines 100-130)

**Subject Data Persistence and ATTOM Coordinate Fix:**
- **Issue**: Enhanced Market Analysis map was centering on default Austin, TX coordinates instead of real ATTOM-provided property locations; subject data with latlng coordinates was not persisting to disk
- **Root Cause**: 
  1. ATTOM API returns lat/lon as strings (e.g., "27.483621"), but backend Zod validation expected numbers, causing 400 validation errors
  2. No storage method existed to persist subject data separate from order tabs
  3. Frontend wasn't transforming ATTOM location format {lat, lon} to Subject format {lat, lng}
- **Solution**: 
  1. Added `updateSubject()` method to storage interface and implementation (server/storage.ts)
  2. Enhanced subject tab validation schema to accept latlng, attomId, apn, quality, condition fields (server/routes.ts)
  3. Modified PUT /api/orders/:id/tabs/subject route to extract Subject-specific fields and call storage.updateSubject()
  4. Fixed frontend applyAttomDataToForm to parse ATTOM string coordinates to numbers using parseFloat()
  5. Subject data now persists to data/orders/{orderId}/subject.json
- **Verification**: End-to-end test confirmed map now centers on real Bradenton, FL coordinates (27.48, -82.61) instead of Austin defaults (30.27, -97.74)
- **Files Modified**: server/storage.ts (lines 53-57, 796-831), server/routes.ts (lines 637-671), client/src/pages/orders/[orderId]/subject.tsx (lines 152-185)

### October 12, 2025 - Complete Enhanced Market Analysis System
**Overview**: Implemented enterprise-grade market analysis system with interactive mapping, regression-based trend analysis, GSE-compliant adjustments, and appraiser validation workflow.

**Core Components Implemented:**

1. **Data Model & Storage** (shared/schema.ts, server/storage.ts):
   - Comprehensive schemas: Submarket, SubmarketTrend, MarketAdjustment, BenchmarkComparison, AdjustmentValidation
   - File-based persistence in `data/orders/{orderId}/market/enhanced/` with JSON snapshots and append-only JSONL audit logs
   - Zod validation schemas for all API operations

2. **API Routes** (server/routes.ts):
   - 14 RESTful endpoints with defense-in-depth security
   - Route-level auth → entity ownership checks → Zod validation → explicit orderId enforcement
   - Endpoints: submarkets, auto-tag, trends, adjustments, benchmarks, validations

3. **Interactive Mapping** (client/src/components/map/EnhancedMarketMap.tsx):
   - Leaflet v4.2.1 with leaflet-draw for polygon boundaries
   - Subject/comp markers with color coding
   - Draw, save, edit submarket polygons
   - Auto-tag comps to submarkets using @turf/turf point-in-polygon

4. **Trend Analysis** (server/lib/geospatial.ts, client/src/components/market/TrendDashboard.tsx):
   - Linear regression using least squares method
   - Polynomial regression (degree 2) using Cramer's rule with proper determinants
   - Confidence band calculations
   - Recharts ComposedChart displaying regression lines, confidence bands, DOM trends, absorption rates
   - Submarket comparison charts

5. **Adjustment Calculator** (client/src/components/market/AdjustmentCalculator.tsx):
   - Three calculation methods: linear-trend, polynomial-trend, median-comparison
   - Proper timeline mapping: sale date → effective date with month indexing from trend's analysisDate
   - Transparent UI showing all inputs, methodology, and results
   - Full audit trail with metadata capture

6. **GSE Alignment** (client/src/components/market/BenchmarkAlignment.tsx):
   - Multi-source benchmarks: Fannie Mae, Freddie Mac, TrueTracts, Historical Internal
   - Variance tracking with configurable acceptable ranges (±1.5%)
   - Alert system: warning > 1%, critical > 2%
   - Status determination: within-range, review-recommended, outside-tolerance

7. **Validation Workflow** (client/src/components/market/ValidationWorkflow.tsx):
   - Run validation checks: GSE alignment, sample size, confidence threshold, trend significance
   - Appraiser review interface: Approve/Needs Review/Reject with notes
   - Iterative workflow: rejected/needs-review adjustments re-appear for correction
   - Only approved adjustments finalized and removed from pending list

8. **Navigation Integration** (client/src/pages/orders/[orderId]/market.tsx, market-enhanced.tsx):
   - Prominent "Enhanced Market Analysis" card in existing Market tab overview
   - Feature highlights with icons and descriptions
   - Bidirectional navigation: Market ↔ Enhanced Market Analysis
   - Seamless user journey without disrupting existing functionality

**Security Features:**
- Defense-in-depth: auth middleware + ownership verification + Zod validation + orderId enforcement
- No cross-order data leakage
- Audit trails for all operations

**GSE Compliance:**
- Defensible adjustment calculations with transparent methodology
- Multi-source benchmark comparisons
- Complete audit trail (inputs, methods, results, timestamps, user)
- Appraiser validation and approval workflow