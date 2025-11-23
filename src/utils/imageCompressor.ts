
export const compressImage = (
  file: File, 
  maxWidth: number = 800, 
  initialQuality: number = 0.6,
  maxSizeKB: number = 58.3 // Updated limit
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        let quality = initialQuality;
        let width = img.width;
        let height = img.height;

        // Calculate aspect ratio
        const ratio = height / width;

        // Initial resize logic
        if (width > maxWidth) {
          width = maxWidth;
          height = Math.round(width * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        let ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Canvas context unavailable"));
            return;
        }

        const draw = (w: number, h: number) => {
           canvas.width = w;
           canvas.height = h;
           ctx = canvas.getContext('2d'); // Re-get context after resize
           if(ctx) {
             ctx.fillStyle = '#FFFFFF'; // Handle png transparency
             ctx.fillRect(0, 0, w, h);
             ctx.drawImage(img, 0, 0, w, h);
           }
        };

        // Initial draw
        draw(width, height);

        // Helper to get byte size from base64
        const getByteSize = (base64: string) => {
          // Base64 is 4/3 larger than binary. 
          // Formula: (chars * 3 / 4) - padding
          const stringLength = base64.length - (base64.indexOf(',') + 1);
          const sizeInBytes = (stringLength * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
          return sizeInBytes;
        };

        const targetBytes = maxSizeKB * 1024;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        
        // Iterative compression loop
        let attempts = 0;
        const maxAttempts = 20;

        while (getByteSize(dataUrl) > targetBytes && attempts < maxAttempts) {
           // Strategy: Reduce quality. If quality gets too low (bad visual), reduce dimensions instead.
           if (quality > 0.2) {
             quality -= 0.1;
           } else {
             // If quality is already low, shrink image dimensions significantly
             width = Math.floor(width * 0.75); // 25% reduction
             height = Math.floor(height * 0.75);
             draw(width, height);
             // Reset quality slightly so the smaller image looks okay
             quality = 0.5; 
           }
           
           dataUrl = canvas.toDataURL('image/jpeg', quality);
           attempts++;
        }

        resolve(dataUrl);
      };
      
      img.onerror = (e) => reject(e);
    };
    
    reader.onerror = (e) => reject(e);
  });
};