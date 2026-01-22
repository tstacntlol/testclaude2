// PDF.js worker configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// PDF Viewer class to handle individual PDF sections
class PDFViewer {
    constructor(sectionId) {
        this.sectionId = sectionId;
        this.canvas = document.getElementById(`${sectionId}-canvas`);
        this.loadingDiv = document.querySelector(`#${sectionId}-viewer .pdf-loading`);
        this.controls = document.querySelector(`#${sectionId}-viewer .pdf-controls`);
        this.pageNumSpan = document.getElementById(`${sectionId}-page-num`);
        this.pageCountSpan = document.getElementById(`${sectionId}-page-count`);
        this.prevBtn = document.getElementById(`${sectionId}-prev`);
        this.nextBtn = document.getElementById(`${sectionId}-next`);

        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.scale = 1.5;

        // Maximum height for PDF (to fit within viewport)
        this.maxHeight = window.innerHeight - 300; // Leave room for header, controls, etc.

        // Bind event listeners
        if (this.prevBtn && this.nextBtn) {
            this.prevBtn.addEventListener('click', () => this.onPrevPage());
            this.nextBtn.addEventListener('click', () => this.onNextPage());
        }
    }

    async loadPDF(url) {
        if (!url) {
            this.showMessage('Aucun PDF disponible');
            return;
        }

        try {
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;

            this.pageCountSpan.textContent = this.pdfDoc.numPages;

            // Hide loading, show controls
            this.loadingDiv.style.display = 'none';
            this.controls.style.display = 'flex';
            this.canvas.style.display = 'block';

            // Render first page
            this.renderPage(this.pageNum);
        } catch (error) {
            console.error(`Error loading PDF for ${this.sectionId}:`, error);
            this.showMessage('Erreur lors du chargement du PDF');
        }
    }

    renderPage(num) {
        this.pageRendering = true;

        this.pdfDoc.getPage(num).then(page => {
            // Get initial viewport to calculate proper scale
            const initialViewport = page.getViewport({ scale: 1.0 });

            // Calculate scale to fit within maxHeight while maintaining aspect ratio
            let scale = this.maxHeight / initialViewport.height;

            // Also check if width needs to be constrained
            const maxWidth = Math.min(window.innerWidth - 100, 1000); // Max 1000px or window width
            const widthScale = maxWidth / initialViewport.width;

            // Use the smaller scale to ensure it fits in both dimensions
            scale = Math.min(scale, widthScale);

            // Get final viewport with calculated scale
            const viewport = page.getViewport({ scale: scale });
            const context = this.canvas.getContext('2d');

            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            const renderTask = page.render(renderContext);

            renderTask.promise.then(() => {
                this.pageRendering = false;
                if (this.pageNumPending !== null) {
                    this.renderPage(this.pageNumPending);
                    this.pageNumPending = null;
                }
            });
        });

        this.pageNumSpan.textContent = num;
        this.updateButtons();
    }

    queueRenderPage(num) {
        if (this.pageRendering) {
            this.pageNumPending = num;
        } else {
            this.renderPage(num);
        }
    }

    onPrevPage() {
        if (this.pageNum <= 1) {
            return;
        }
        this.pageNum--;
        this.queueRenderPage(this.pageNum);
    }

    onNextPage() {
        if (this.pageNum >= this.pdfDoc.numPages) {
            return;
        }
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
    }

    updateButtons() {
        if (this.prevBtn && this.nextBtn) {
            this.prevBtn.disabled = (this.pageNum <= 1);
            this.nextBtn.disabled = (this.pageNum >= this.pdfDoc.numPages);
        }
    }

    showMessage(message) {
        this.loadingDiv.innerHTML = `<p>${message}</p>`;
        this.controls.style.display = 'none';
        this.canvas.style.display = 'none';
    }
}

// Modal PDF Viewer class for enlarged view
class ModalPDFViewer {
    constructor() {
        this.modal = document.getElementById('pdf-modal');
        this.canvas = document.getElementById('modal-canvas');
        this.pageNumSpan = document.getElementById('modal-page-num');
        this.pageCountSpan = document.getElementById('modal-page-count');
        this.prevBtn = document.getElementById('modal-prev');
        this.nextBtn = document.getElementById('modal-next');
        this.closeBtn = document.querySelector('.pdf-modal-close');
        this.overlay = document.querySelector('.pdf-modal-overlay');

        this.pdfDoc = null;
        this.pageNum = 1;
        this.pageRendering = false;
        this.pageNumPending = null;
        this.isZoomed = false;

        // Bind event listeners
        if (this.prevBtn && this.nextBtn) {
            this.prevBtn.addEventListener('click', () => this.onPrevPage());
            this.nextBtn.addEventListener('click', () => this.onNextPage());
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.close());
        }

        // Click canvas to zoom
        if (this.canvas) {
            this.canvas.addEventListener('click', () => this.toggleZoom());
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (this.modal.style.display === 'flex') {
                if (e.key === 'Escape') {
                    this.close();
                } else if (e.key === 'ArrowLeft') {
                    this.onPrevPage();
                } else if (e.key === 'ArrowRight') {
                    this.onNextPage();
                }
            }
        });
    }

    open(pdfDoc) {
        this.pdfDoc = pdfDoc;
        this.pageNum = 1;
        this.isZoomed = false;
        this.canvas.classList.remove('zoomed');
        this.pageCountSpan.textContent = pdfDoc.numPages;
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        this.renderPage(this.pageNum);
    }

    close() {
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.isZoomed = false;
        this.canvas.classList.remove('zoomed');
    }

    toggleZoom() {
        this.isZoomed = !this.isZoomed;
        if (this.isZoomed) {
            this.canvas.classList.add('zoomed');
        } else {
            this.canvas.classList.remove('zoomed');
        }
        this.renderPage(this.pageNum);
    }

    renderPage(num) {
        this.pageRendering = true;

        this.pdfDoc.getPage(num).then(page => {
            // Get initial viewport to calculate proper scale
            const initialViewport = page.getViewport({ scale: 1.0 });

            // Calculate scale to fit within modal while maintaining aspect ratio
            const maxHeight = window.innerHeight * 0.85;
            const maxWidth = window.innerWidth * 0.9;

            let scale = Math.min(maxHeight / initialViewport.height, maxWidth / initialViewport.width);

            // If zoomed, increase scale by 20%
            if (this.isZoomed) {
                scale = scale * 1.2;
            }

            // Get final viewport with calculated scale
            const viewport = page.getViewport({ scale: scale });
            const context = this.canvas.getContext('2d');

            this.canvas.height = viewport.height;
            this.canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };

            const renderTask = page.render(renderContext);

            renderTask.promise.then(() => {
                this.pageRendering = false;
                if (this.pageNumPending !== null) {
                    this.renderPage(this.pageNumPending);
                    this.pageNumPending = null;
                }
            });
        });

        this.pageNumSpan.textContent = num;
        this.updateButtons();

        // Update button sizes when zoomed
        if (this.isZoomed) {
            this.prevBtn.style.transform = 'scale(0.8)';
            this.nextBtn.style.transform = 'scale(0.8)';
        } else {
            this.prevBtn.style.transform = 'scale(1)';
            this.nextBtn.style.transform = 'scale(1)';
        }
    }

    queueRenderPage(num) {
        if (this.pageRendering) {
            this.pageNumPending = num;
        } else {
            this.renderPage(num);
        }
    }

    onPrevPage() {
        if (this.pageNum <= 1) {
            return;
        }
        this.pageNum--;
        this.queueRenderPage(this.pageNum);
    }

    onNextPage() {
        if (this.pageNum >= this.pdfDoc.numPages) {
            return;
        }
        this.pageNum++;
        this.queueRenderPage(this.pageNum);
    }

    updateButtons() {
        if (this.prevBtn && this.nextBtn) {
            this.prevBtn.disabled = (this.pageNum <= 1);
            this.nextBtn.disabled = (this.pageNum >= this.pdfDoc.numPages);
        }
    }
}

// Initialize PDF viewers
const viewers = {
    programma: new PDFViewer('programma'),
    traject: new PDFViewer('traject'),
    'over-ons': new PDFViewer('over-ons')
};

// Initialize modal viewer
const modalViewer = new ModalPDFViewer();

// Load PDF configurations and initialize viewers
async function initializePDFs() {
    const sections = ['programma', 'traject', 'over-ons'];

    for (const section of sections) {
        try {
            const response = await fetch(`content/pdfs/${section}.json`);
            const data = await response.json();

            if (data.active && data.pdf) {
                await viewers[section].loadPDF(data.pdf);

                // Add click handler to open modal
                const canvas = document.getElementById(`${section}-canvas`);
                if (canvas) {
                    canvas.addEventListener('click', () => {
                        const viewer = viewers[section];
                        if (viewer.pdfDoc) {
                            modalViewer.open(viewer.pdfDoc);
                        }
                    });
                }
            } else {
                viewers[section].showMessage('Aucun PDF téléchargé');
            }
        } catch (error) {
            console.error(`Error loading config for ${section}:`, error);
            viewers[section].showMessage('Nog geen PDF geüpload');
        }
    }
}

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Load contact information dynamically
async function loadContactInfo() {
    try {
        const response = await fetch('content/settings/contact.json');
        const data = await response.json();

        // Update address
        const addressEl = document.getElementById('contact-address');
        if (addressEl && data.organizationName) {
            addressEl.innerHTML = `
                ${data.organizationName}<br>
                ${data.street}<br>
                ${data.postalCode} ${data.city}<br>
                ${data.country}
            `;
        }

        // Update hours
        const hoursEl = document.getElementById('contact-hours');
        if (hoursEl && data.hours) {
            hoursEl.innerHTML = `
                ${data.hours.weekdays}<br>
                ${data.hours.weekend}
            `;
        }
    } catch (error) {
        console.error('Error loading contact info:', error);
    }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializePDFs();
    loadContactInfo();
});
