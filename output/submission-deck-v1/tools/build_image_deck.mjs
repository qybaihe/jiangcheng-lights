import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { Presentation, PresentationFile } from '@oai/artifact-tool';

const { values: args } = parseArgs({ options: {
  manifest: { type: 'string' },
  final: { type: 'string' },
  build: { type: 'string' },
  workspace: { type: 'string' },
  'last-slide-link': { type: 'string' },
}});
for (const key of ['manifest', 'final', 'build', 'workspace']) {
  if (!args[key] || !path.isAbsolute(args[key])) throw new Error(`--${key} must be an absolute path`);
}
const SKILL_DIR = '/Users/baihe/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations';
const PYTHON = '/Users/baihe/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const manifest = JSON.parse(await fs.readFile(args.manifest, 'utf8'));
if (!Array.isArray(manifest.slides) || manifest.slides.length !== manifest.expected_slide_count) throw new Error('Manifest count mismatch');
await fs.mkdir(args.build, { recursive: true });
await fs.mkdir(path.dirname(args.final), { recursive: true });
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const sourceDocuments = [
  'README.md',
  'output/江城有灯-游戏亮点-参赛提交.md',
  'output/江城有灯-AI辅助开发说明-参赛提交.txt',
  'docs/EDGEONE-SUBMISSION-RELEASE.md',
  'output/submission-deck-v1/qa/copy-review.md',
].map(p => path.join(args.workspace, p));
for (const [index, source] of manifest.slides.entries()) {
  const slide = presentation.slides.add();
  const bytes = await fs.readFile(source.image);
  slide.images.add({
    blob: new Uint8Array(bytes), contentType: 'image/jpeg',
    alt: `江城有灯参赛作品介绍，第 ${index + 1} 页`,
    fit: 'contain', position: { left: 0, top: 0, width: 1280, height: 720 },
    geometry: 'rect', crop: { left: 0, top: 0, right: 0, bottom: 0 },
  });
  // Provenance stays in notes. No native visible text or drawing is added.
  slide.speakerNotes.textFrame.setText(`图像来源：${source.image}\n${source.prompt ? `生成提示词：${source.prompt}\n` : ''}SHA-256：${source.sha256}\n内容依据：\n${sourceDocuments.join('\n')}`);
}
const candidatePath = path.join(args.build, 'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
if (args['last-slide-link']) {
  const qaTool = path.join(path.dirname(new URL(import.meta.url).pathname), 'deck_qa.py');
  const linked = spawnSync(PYTHON, [decodeURIComponent(qaTool), 'add-link', '--pptx', candidatePath, '--slide', String(manifest.expected_slide_count), '--url', args['last-slide-link']], { encoding: 'utf8' });
  if (linked.status !== 0) throw new Error(linked.stderr || linked.stdout || 'Hyperlink metadata patch failed');
  process.stdout.write(linked.stdout);
}
const { finalizePresentation } = await import(pathToFileURL(path.join(SKILL_DIR, 'container_tools/artifact_tool_utils.mjs')).href);
const result = await finalizePresentation({
  workspaceDir: args.workspace,
  candidatePath, finalPath: args.final,
  explicitTotalSlideCount: manifest.expected_slide_count,
  pythonExecutable: PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(SKILL_DIR, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit'],
  requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [],
  verifyArtifactToolImport: true,
  receiptPath: path.join(args.build, 'artifact-validation.json'),
});
console.log(JSON.stringify({ final: args.final, slides: manifest.expected_slide_count, result }, null, 2));
