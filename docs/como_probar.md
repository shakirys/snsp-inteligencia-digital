# Cómo abrir y probar la plataforma — checklist

## 1. Abrir la plataforma

```bash
cd snsp
python3 -m http.server 8080
```

Abre `http://localhost:8080/index.html` en tu navegador.

## 2. Iniciar sesión

Elige cualquiera de los 6 perfiles demostrativos (chip debajo del formulario,
p. ej. "Superadministrador") y entra. No se necesita contraseña real.

## 3. Checklist de verificación (recomendado antes de usarla con público interno)

- [ ] El login carga sin errores y permite entrar con cualquier perfil.
- [ ] El Dashboard general abre y muestra 4 tarjetas con números (no "Dato
      pendiente de carga", ya que sí hay datos reales cargados).
- [ ] El módulo **CACU** carga: tarjetas, gráficas, mapa nacional y tabla de
      ranking con datos.
- [ ] El módulo **Cáncer de mama** carga igual.
- [ ] En cualquiera de los dos módulos, selecciona una entidad en el filtro
      (p. ej. "Querétaro") y presiona "Aplicar filtros": los números de las
      tarjetas deben cambiar a los de esa entidad.
- [ ] Presiona "Limpiar": los números vuelven al total nacional.
- [ ] Abre la consola del navegador (F12 → Console) y confirma que no hay
      errores en rojo al navegar por login → dashboard → CACU → Mama →
      Metodología → Usuarios y permisos.
- [ ] En "Metodología", confirma que las fuentes, variables y limitaciones
      descritas correspondan a lo que ves en pantalla.
- [ ] Los botones "Exportar PDF" / "Exportar Excel" aparecen deshabilitados
      y marcados "(pendiente)" — no se debe poder simular una descarga.
- [ ] Ningún texto en pantalla dice literalmente `null`, `undefined` o `NaN`.

## 4. Si algo no coincide con los CSV originales

Los totales que debes ver (sin filtrar, national/total):

| Fuente | Total esperado |
|---|---|
| Casos confirmados CACU | 607 |
| Casos confirmados Mama | 2,388 |
| Citologías convencionales | 246,953 |
| Citologías base líquida | 48,247 |
| PCR VPH | 378,141 |
| Mastografías | 537,218 |

Estos números están tomados directamente de `data/raw/*.csv` (sin
transformar) y deben coincidir exactamente con los KPI sin filtros aplicados.

## 5. Regenerar los datos si llegan bases nuevas

```bash
cd scripts
python3 build_data.py
```

Esto reescribe `data/processed/` y `data/real/indicadores_2025.js`. No hace
falta tocar ningún archivo HTML/CSS/JS de la interfaz.
