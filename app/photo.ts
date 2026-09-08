/**
 * Prepara a foto do barbeiro antes de enviar.
 *
 * A câmera do celular gera arquivos de vários megabytes. Aqui a imagem é
 * recortada no quadrado central, reduzida e comprimida no próprio navegador,
 * então o que trafega e o que fica guardado é uma miniatura.
 */

const MAX_SIDE = 400;
const MAX_BYTES = 300_000;
const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45];

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class PhotoError extends Error {}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError("Não foi possível abrir esta imagem."));
    };

    image.src = url;
  });
}

export async function prepareBarberPhoto(file: File) {
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    throw new PhotoError("Escolha uma imagem JPEG, PNG ou WEBP.");
  }

  const image = await loadImage(file);
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  if (side === 0) throw new PhotoError("Esta imagem parece estar vazia.");

  const canvas = document.createElement("canvas");
  canvas.width = MAX_SIDE;
  canvas.height = MAX_SIDE;

  const context = canvas.getContext("2d");
  if (!context) throw new PhotoError("Seu navegador não conseguiu processar a imagem.");

  // Recorte central: mantém o rosto no meio em fotos verticais e horizontais.
  context.drawImage(
    image,
    (image.naturalWidth - side) / 2,
    (image.naturalHeight - side) / 2,
    side,
    side,
    0,
    0,
    MAX_SIDE,
    MAX_SIDE,
  );

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_BYTES) return dataUrl;
  }

  throw new PhotoError("A imagem ficou grande demais. Tente uma foto mais simples.");
}
