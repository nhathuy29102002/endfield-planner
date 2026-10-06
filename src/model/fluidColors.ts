/**
 * Màu ống theo chất đang chảy, chép từ bảng màu vật tư của EnKAD (chunk có
 * `spritesheet-lod1`, biến `{item_muck_feces_1:[159,128,110], …}`), chỉ giữ chất lỏng/khí.
 * Ống chưa chở gì dùng `EMPTY_PIPE`. Vật tư không có trong bảng thì quay về màu ống mặc định.
 */
export const FLUID_COLORS: Record<string, string> = {
  item_liquid_water: '#4febff',
  item_liquid_acid: '#ae7113',
  item_liquid_xiranite: '#4c9516',
  item_liquid_xiranite_enr: '#c9e819',
  item_liquid_xiranite_lowpoly: '#226742',
  item_liquid_xiranite_poly: '#607b4f',
  item_liquid_sewage: '#5e5e5e',
  item_liquid_copper: '#cb2a24',
  item_liquid_copper_enr: '#fa8d73',
  item_liquid_plant_grass_1: '#46dd46',
  item_liquid_plant_grass_2: '#acff83',
  item_gas_inert: '#73cada',
  item_gas_water: '#60768e',
  item_gas_acid: '#e9cc83',
  item_gas_xiranite: '#a0c58d',
  item_gas_xiranite_enr: '#9ed72a',
  item_gas_copper: '#e7998e',
  item_gas_copper_enr: '#dea79d',
  item_gas_copper_enr2: '#ebaf8d',
  item_activity_copper_poly_gas: '#e0a547',
};

/** Ống chưa chở gì: xám xanh, để không lẫn với ống nước (xanh lơ). */
export const EMPTY_PIPE = '#5b8c94';
