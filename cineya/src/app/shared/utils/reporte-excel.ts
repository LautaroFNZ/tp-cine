import { DatosReporte } from './reporte-pdf';
import { formatoDiaMes } from './rango-fechas';

const MONEDA = '"$" #,##0';
const ROJO = '#E3242B';

type Celda =
  | string
  | number
  | { value: string | number; fontWeight?: 'bold'; format?: string; textColor?: string; backgroundColor?: string };

const encabezado = (texto: string): Celda => ({
  value: texto,
  fontWeight: 'bold',
  textColor: '#FFFFFF',
  backgroundColor: ROJO
});

const negrita = (valor: string | number, format?: string): Celda => ({ value: valor, fontWeight: 'bold', format });

// Arma las hojas del libro: facturación por día, películas y productos
export function armarHojasReporte(datos: DatosReporte) {
  const facturado = datos.ventas.reduce((suma, v) => suma + v.facturado, 0);
  const entradas = datos.ventas.reduce((suma, v) => suma + v.entradas, 0);
  const compras = datos.ventas.reduce((suma, v) => suma + v.compras, 0);

  const ventas: Celda[][] = [
    [encabezado('Día'), encabezado('Compras'), encabezado('Entradas'), encabezado('Facturado')],
    ...datos.ventas.map((v): Celda[] => [
      formatoDiaMes(v.dia),
      v.compras,
      v.entradas,
      { value: v.facturado, format: MONEDA }
    ]),
    [negrita('Total'), negrita(compras), negrita(entradas), negrita(facturado, MONEDA)]
  ];

  const ranking = (rotulo: string, unidad: string, items: DatosReporte['productos']): Celda[][] => [
    [encabezado('Puesto'), encabezado(rotulo), encabezado(unidad)],
    ...items.map((item, i): Celda[] => [i + 1, item.nombre, item.cantidad])
  ];

  return [
    {
      data: ventas,
      sheet: 'Facturación por día',
      columns: [{ width: 14 }, { width: 11 }, { width: 11 }, { width: 18 }],
      stickyRowsCount: 1
    },
    {
      data: ranking('Película', 'Entradas', datos.peliculasSemana),
      sheet: 'Películas (7 días)',
      columns: [{ width: 9 }, { width: 46 }, { width: 11 }],
      stickyRowsCount: 1
    },
    {
      data: ranking('Película', 'Entradas', datos.peliculasMes),
      sheet: 'Películas (30 días)',
      columns: [{ width: 9 }, { width: 46 }, { width: 11 }],
      stickyRowsCount: 1
    },
    {
      data: ranking('Producto', 'Unidades', datos.productos),
      sheet: 'Productos',
      columns: [{ width: 9 }, { width: 40 }, { width: 11 }],
      stickyRowsCount: 1
    }
  ];
}

// Genera el Excel del reporte y lo descarga. La librería se carga solo cuando hace falta.
export async function descargarExcelReporte(datos: DatosReporte): Promise<void> {
  const { default: escribirExcel } = await import('write-excel-file/browser');
  await escribirExcel(armarHojasReporte(datos)).toFile(`reporte-cineya-${datos.desde}-a-${datos.hasta}.xlsx`);
}