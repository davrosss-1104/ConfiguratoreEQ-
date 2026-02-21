import sharp from 'sharp';
import { readdirSync } from 'fs';
import { join } from 'path';

const dir = './frontend/public/icons';
const files = readdirSync(dir).filter(f => f.endsWith('.svg'));

console.log(`Trovate ${files.length} icone SVG`);

for (const file of files) {
    const png = file.replace('.svg', '.png');
    try {
        // Legge SVG a densità alta per qualità, senza forzare dimensioni
        await sharp(join(dir, file), { density: 300 })
            .png()
            .toFile(join(dir, png));
        
        // Verifica dimensioni risultanti
        const meta = await sharp(join(dir, png)).metadata();
        console.log(`  ✓ ${file} → ${png} (${meta.width}x${meta.height})`);
    } catch (e) {
        console.log(`  ✗ ${file}: ${e.message}`);
    }
}
console.log('Fatto!');