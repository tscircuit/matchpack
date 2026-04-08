import { getNetBiasType } from '../lib/utils/netBiasUtils'

console.log('Testing netBiasUtils:')
console.log('VCC:', getNetBiasType('VCC'))
console.log('GND:', getNetBiasType('GND'))
console.log('SDA:', getNetBiasType('SDA'))
console.log('V3_3:', getNetBiasType('V3_3'))
console.log('VSS:', getNetBiasType('VSS'))