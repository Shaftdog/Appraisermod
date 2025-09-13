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

The architecture is designed to be modular and scalable, with clear separation between frontend and backend concerns, making it easy to extend functionality and integrate with additional services as needed.