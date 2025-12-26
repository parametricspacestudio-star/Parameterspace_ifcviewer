# Simple IFC Viewer

## Overview

Simple IFC Viewer is a lightweight, client-side web application for viewing and interacting with IFC (Industry Foundation Classes) 3D models directly in the browser. IFC is a standard file format used in the Architecture, Engineering, and Construction (AEC) industry for Building Information Modeling (BIM).

The application processes all IFC files locally in the browser - no server-side processing or file uploads are required. Key capabilities include:
- Loading and viewing IFC 3D models
- Importing/exporting fragment files for faster subsequent loading
- Selecting, highlighting, and isolating model elements
- Viewing detailed element properties and classifications
- Customizing viewer appearance (background, grid visibility)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend-Only Architecture
- **Problem**: Need a lightweight IFC viewer that works entirely in the browser without backend dependencies
- **Solution**: Pure client-side application using Vite as the build tool and dev server
- **Rationale**: IFC processing happens in the browser using WebAssembly (via web-ifc), eliminating need for server infrastructure and keeping user data private

### 3D Rendering Stack
- **Problem**: Rendering complex 3D BIM models in the browser
- **Solution**: Three.js for WebGL rendering, wrapped by @thatopen/components libraries
- **Components**:
  - `three` (v0.160.1) - Core 3D rendering engine
  - `@thatopen/components` - Base BIM components and utilities
  - `@thatopen/components-front` - Frontend-specific BIM components
  - `@thatopen/fragments` - Fragment file handling for optimized model loading
  - `@thatopen/ui` / `@thatopen/ui-obc` - Pre-built UI components for BIM viewers

### IFC Processing
- **Problem**: Parsing complex IFC files in the browser
- **Solution**: `web-ifc` library (v0.0.66) - WebAssembly-based IFC parser
- **Benefit**: Native-speed IFC parsing without server round-trips

### Build Configuration
- **Tool**: Vite with TypeScript support
- **Target**: ESNext for modern browser features
- **Chunking Strategy**: Manual chunks for `three` and `web-ifc` to optimize loading
- **Dev Server**: Runs on port 5000, configured for 0.0.0.0 host binding

### Project Structure
```
src/
├── viewer/index.ts    # Main viewer logic and initialization
└── styles/main.css    # Application styling with CSS variables
```

### TypeScript Configuration
- ES2022 module and target
- Bundler module resolution (for Vite compatibility)
- No emit (Vite handles transpilation)
- Source maps enabled for debugging

## External Dependencies

### Core Libraries
| Package | Purpose |
|---------|---------|
| `@thatopen/components` | Base BIM viewer components |
| `@thatopen/components-front` | Frontend BIM components |
| `@thatopen/fragments` | Fragment file format handling |
| `@thatopen/ui` | UI component library |
| `@thatopen/ui-obc` | BIM-specific UI components |
| `three` | WebGL 3D rendering |
| `web-ifc` | WebAssembly IFC parser |

### Development Dependencies
| Package | Purpose |
|---------|---------|
| `vite` | Build tool and dev server |
| `typescript` | Type checking |
| `@types/three` | Three.js type definitions |
| `@types/node` | Node.js type definitions |

### Notes
- `htmx.org` is listed as a dependency but doesn't appear to be actively used in the current codebase
- No database or backend services are required - this is a purely client-side application
- All IFC processing occurs locally in the user's browser