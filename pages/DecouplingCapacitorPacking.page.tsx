import { LayoutPipelineDebugger } from "lib/components/LayoutPipelineDebugger"
import { problem } from "../tests/DecouplingCapacitorPacking_data"

/**
 * Visual demo page for decoupling capacitor packing strategy.
 * This demonstrates Issue #15: Specialized Layout for Decoupling Capacitors
 *
 * The solver arranges decoupling capacitors in a neat linear row,
 * sorted by their connection to the main chip's pins.
 */
export default function DecouplingCapacitorPackingPage() {
    return <LayoutPipelineDebugger problem={problem} />
}
