# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run tests**: `bun test` (run all tests)
- **Run specific test**: `bun test <pattern>` (e.g., `bun test LayoutPipeline`)
- **Run single test file**: `bun test tests/LayoutPipelineSolver01.test.ts`
- **Format code**: `bun run format`
- **Check formatting**: `bun run format:check`

Use `bun` as the package manager and runtime instead of npm/node/pnpm.

## Architecture

This is an electronic circuit schematic layout library. It automatically finds optimal placement for circuit components (chips, groups) and their pin connections. The solvers partition into small groups, match to templates, and pack the matched "laid out" designs to form a complete layout.

### Core Pipeline Architecture

The system uses a hierarchical solver pipeline (`LayoutPipelineSolver`) that processes layout in stages:

1. **ChipPartitionsSolver**: Groups components into logical partitions around complex chips
2. **PinRangeMatchSolver**: Identifies optimal pin groupings and matches against layout patterns
3. **PinRangeLayoutSolver**: Applies matched layouts, positioning connected components
4. **PinRangeOverlapSolver**: Resolves component overlaps between pin ranges
5. **PartitionPackingSolver**: Final packing into cohesive layout

### Key Data Flow

- **Input**: `InputProblem` (from `lib/testing/getInputProblemFromCircuitJsonSchematic.ts`)
  - Converts circuit-json format to internal representation
  - Defines chips, groups, pins, and connections (strong pin-to-pin, weak net-based)
- **Output**: `OutputLayout` with final component positions and rotations

### Connection Types

- **Strong connections**: Direct pin-to-pin connections (exactly 2 pins), crucial for layout optimization
- **Weak connections**: Multi-pin nets (power, ground, buses), affect component orientation but not primary layout

### Directory Structure

- `lib/solvers/`: Core algorithm implementations, all inherit from `BaseSolver`
- `lib/components/`: React visualization components for debugging
- `lib/testing/`: Circuit-json conversion utilities
- `lib/types/`: TypeScript definitions including `InputProblem` and `OutputLayout`
- `tests/`: Test cases using real circuit examples (Hall-effect sensors, I2C, power management)

### Development Notes

- All solvers support step-by-step solving and visualization through `BaseSolver`
- Test cases use realistic circuit examples for validation
- React Cosmos provides interactive component development environment
- Use readable component names in tests when possible (`useReadableIds: true`)
