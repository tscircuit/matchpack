# matchpack

The goal of this module is to find the best schematic layout for a set of `SchematicChip`s and `SchematicGroups` containing
`SchematicPins` connected to each other with `SchematicTraces`

To do this, we use a series of solvers that are run in a pipeline. Each solver is responsible for a specific piece of
input preprocessing or calculation.

This is roughly the hierarchy of solvers:

```
LayoutPipelineSolver: Runs pipeline
↳ ChipPartitionsSolver: Creates partitions (small subset groups) surrounding complex chips
↳ PinRangeMatchSolver: Finds pin ranges on each chip in the partition, constructs a subset group with just that pin range, then matches a laid out design from the corpus
↳ PinRangeLayoutSolver: Applies the matched layout to the pin ranges, moving passives that are connected to each pin range
↳ PinRangeOverlapSolver: Finds overlaps between laid out boxes from each pin range and fixes them
↳ PartitionPackingSolver: Packs the laid out chip partitions into a single layout
```
