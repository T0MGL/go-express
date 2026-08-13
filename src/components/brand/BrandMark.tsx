// Los PNG originales (isotipo 6204x7794, logotipo 9597x1506) siguen en public/
// porque los consumen el email transaccional del backend y las OG cards. Para la
// app se sirven estas variantes, dimensionadas al 3x de su mayor uso real.
// display:contents en el <picture> deja al <img> como hijo directo del layout,
// asi el wrapper no altera flex, gap ni margenes existentes.
//
// Sin atributos width/height a proposito. El atributo width es un hint de
// presentacion que gana sobre el ancho derivado del ratio, asi que en un
// consumidor que fija solo la altura (`h-7`) el logotipo se estiraba a 535px de
// ancho en vez de los 178px que le corresponden. Cada llamador ya decide el
// tamano por clase, y el header tiene altura fija: no hay CLS que ganar aca.

const ISOTIPO = '/brand/isotipo-144';
const LOGOTIPO = '/brand/logotipo-84';

interface BrandMarkProps {
  className?: string;
  loading?: 'eager' | 'lazy';
}

export function Isotipo({ className, loading = 'eager' }: BrandMarkProps) {
  return (
    <picture className="contents">
      <source srcSet={`${ISOTIPO}.webp`} type="image/webp" />
      <img
        src={`${ISOTIPO}.png`}
        alt="Go Express"
        loading={loading}
        decoding="async"
        className={className}
      />
    </picture>
  );
}

export function Logotipo({ className, loading = 'eager' }: BrandMarkProps) {
  return (
    <picture className="contents">
      <source srcSet={`${LOGOTIPO}.webp`} type="image/webp" />
      <img
        src={`${LOGOTIPO}.png`}
        alt="Go Express"
        loading={loading}
        decoding="async"
        className={className}
      />
    </picture>
  );
}
