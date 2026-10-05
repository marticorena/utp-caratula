"""Supported page and APA font presets shared by all output formats."""

from dataclasses import dataclass
import os
from pathlib import Path

from reportlab.lib.pagesizes import A4, letter


@dataclass(frozen=True)
class FontPreset:
    name: str
    size: int
    regular_file: str
    bold_file: str

    @property
    def bold_name(self) -> str:
        return f'{self.name}-Bold'

    @property
    def line_height(self) -> float:
        return 26.84 * self.size / 11


FONTS = {
    'calibri': FontPreset('Calibri', 11, 'calibri.ttf', 'calibrib.ttf'),
    'arial': FontPreset('Arial', 11, 'arial.ttf', 'arialbd.ttf'),
    'times': FontPreset('Times New Roman', 12, 'times.ttf', 'timesbd.ttf'),
    'georgia': FontPreset('Georgia', 11, 'georgia.ttf', 'georgiab.ttf'),
}
BUNDLED_FONT_DIR = Path(__file__).resolve().parent.parent / 'fonts'
if os.environ.get('FONT_MODE') == 'portable' and not BUNDLED_FONT_DIR.is_dir():
    FONTS = {
        'calibri': FontPreset('Carlito', 11, '/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf', '/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf'),
        'arial': FontPreset('Liberation Sans', 11, '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'),
        'times': FontPreset('Liberation Serif', 12, '/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf'),
        'georgia': FontPreset('DejaVu Serif', 11, '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'),
    }
PAGES = {'letter': letter, 'a4': A4}
