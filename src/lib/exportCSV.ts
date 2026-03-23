interface ColumnDef<T> {
  label: string;
  accessor: (item: T) => string | number;
}

export const exportToCSV = <T,>(
  data: T[],
  filename: string,
  columns: ColumnDef<T>[]
) => {
  // Generar headers
  const headers = columns.map((col) => col.label).join(',');

  // Generar filas
  const rows = data.map((item) => {
    return columns
      .map((col) => {
        const value = col.accessor(item);
        // Escapar comas y comillas
        return `"${String(value).replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  // Combinar todo
  const csv = [headers, ...rows].join('\n');

  // Crear blob y descargar
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute(
    'download',
    `${filename}_${new Date().toISOString().split('T')[0]}.csv`
  );
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
