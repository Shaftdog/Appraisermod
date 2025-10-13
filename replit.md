# Order UI Shell - Professional Appraisal Management

## Overview

Order UI Shell is a comprehensive React-based application for managing professional appraisal orders. It provides a tabbed navigation interface with status tracking, sign-off workflows, and version comparison capabilities. The system is designed to streamline the appraisal process for professionals, offering specialized tabs for order summary, property details, market analysis, comparables, sketches, photos, cost analysis, reconciliation, quality control, and export functionality. The application aims to be a complete workflow management tool, featuring a responsive design for various devices.

### Workflow Tab Order

The application follows a logical appraisal workflow with tabs ordered as:

1. **Order Summary** - Overview and order details
2. **Subject Property** - Subject property information and ATTOM data lookup
3. **Highest & Best Use** - Analysis using the four tests of highest and best use (positioned early for workflow efficiency)
4. **Market Analysis** - Enhanced market analysis with submarkets, trends, and adjustments
5. **Comparables** - Comparable sales selection and analysis
6. **Sketch & GLA** - Property sketches and gross living area
7. **Photos** - Property photography
8. **Cost Approach** - Cost approach valuation
9. **Reconciliation** - Final value reconciliation
10. **Activity Log** - Audit trail and activity tracking
11. **QC & Sign-off** - Quality control and approval workflow
12. **Delivery & Exports** - Report generation and delivery

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend utilizes React 18+ with TypeScript, employing a component-based design. It uses Radix UI primitives with shadcn/ui for consistent, accessible design, wouter for lightweight client-side routing, and React Query for server state management. Styling is handled by Tailwind CSS, supporting theme customization and light/dark modes.

### Backend Architecture
The backend is built with Express.js and TypeScript, following a RESTful API design. It features middleware for JSON parsing, CORS, and request logging. API routes adhere to REST conventions for order management, tab operations, version control, and sign-off workflows.

### Data Storage Solutions
A hybrid persistence approach is used, combining PostgreSQL with Drizzle ORM for type-safe database operations. Development and testing use in-memory storage with file-based persistence for sample data. Data models for orders, users, versions, and tab states are defined with Zod schemas for typing and validation.

### Authentication and Authorization
The system includes a basic authentication structure for user management and session handling using Express sessions with PostgreSQL storage. It is prepared for role-based access control.

### Key Design Patterns
The application emphasizes component composition with reusable Radix UI components, a Red/Yellow/Green (RYG) status aggregation system for visual feedback, and a built-in versioning system for tracking changes with diff viewing. It features a mobile-first responsive design and WCAG AA compliant accessibility.

### Development Workflow
The development workflow leverages Vite for fast builds and HMR, TypeScript for strict type safety across frontend and backend, and ESLint for code quality and consistency.

### Core Features
- **Enhanced Market Analysis**: Includes an interactive mapping system with Leaflet, regression-based trend analysis (linear and polynomial), GSE-compliant adjustment calculations, multi-source benchmark alignment, and an appraiser validation workflow. This system supports drawing and saving submarket polygons, auto-tagging comparables, and generating comprehensive audit trails for adjustments.

## External Dependencies

- **React 18+**: Frontend framework.
- **Vite**: Build tool and development server.
- **TypeScript**: Language for type safety.
- **Express.js**: Backend web framework.
- **Tailwind CSS**: Utility-first CSS framework.
- **Radix UI**: Accessible UI primitives.
- **shadcn/ui**: Component library based on Radix UI.
- **Lucide React**: Icon library.
- **@tanstack/react-query**: Server state management.
- **Drizzle ORM**: Type-safe database toolkit.
- **PostgreSQL**: Primary database.
- **@neondatabase/serverless**: PostgreSQL connection for serverless environments.
- **Zod**: Runtime type validation.
- **wouter**: Lightweight routing library.
- **date-fns**: Date manipulation.
- **diff**: Text comparison library.
- **react-hook-form**: Form state management.
- **connect-pg-simple**: PostgreSQL session store for Express.
- **Leaflet**: Interactive maps library.
- **react-leaflet**: React components for Leaflet.
- **leaflet-draw**: Drawing and editing tools for Leaflet maps.
- **@turf/turf**: Geospatial analysis library.