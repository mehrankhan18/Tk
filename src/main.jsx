import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import './styles.css';

gsap.registerPlugin(ScrollTrigger, useGSAP);

const categories = ['All laptops', 'Everyday', 'Work', 'Gaming'];
const money = (value) => `Rs ${value.toLocaleString('en-PK')}`;
const whatsappUrl = 'https://wa.me/923159255165?text=Hi%20TK%20Tech%2C%20I%27m%20interested%20in%20a%20laptop.';

async function getApiError(response) {
  try {
    const body = await response.json();
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use the HTTP status when the server does not return a JSON error.
  }
  return `Request failed (${response.status}). Please try again.`;
}

function loadLegacyProducts() {
  try {
    const savedProducts = localStorage.getItem('tk-tech-products');
    if (!savedProducts) return [];

    const parsedProducts = JSON.parse(savedProducts);
    if (!Array.isArray(parsedProducts) || !parsedProducts.every((product) => (
      product
      && typeof product.id === 'string'
      && typeof product.name === 'string'
      && typeof product.brand === 'string'
      && typeof product.category === 'string'
      && Number.isFinite(product.price)
      && Array.isArray(product.specs)
    ))) {
      throw new Error('Saved product catalog has an invalid format.');
    }

    return parsedProducts.filter((product) => product.custom);
  } catch (error) {
    console.error('Could not load saved product catalog:', error);
    return [];
  }
}

async function compressProductImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file such as JPG, PNG, or WebP.');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 10 MB.');
  }

  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const loadedImage = new Image();
      loadedImage.onload = () => resolve(loadedImage);
      loadedImage.onerror = () => reject(new Error('This image could not be opened. Try another photo.'));
      loadedImage.src = imageUrl;
    });
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const compressedImage = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('The image could not be resized. Try another photo.')),
        'image/jpeg',
        0.78,
      );
    });

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The resized image could not be read.'));
      reader.onerror = () => reject(new Error('The resized image could not be read.'));
      reader.readAsDataURL(compressedImage);
    });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function Icon({ name, size = 20 }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    arrow: <><path d="M7 17 17 7" /><path d="M7 7h10v10" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <path d="M5 12h14" />,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    moon: <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />,
    eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    eyeOff: <><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3 3.8M6.2 6.2C3.5 8.1 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.3 3.3-.7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 44 44" focusable="false"><rect x="1" y="1" width="42" height="42" rx="10" fill="#242521" /><path d="M8 12h17M16.5 12v21M27 12v21m0-10.5L37 12m-10 10.5L37 33" fill="none" stroke="#fbf7f2" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="36.5" cy="36" r="2.5" fill="#ef773b" /></svg></span>;
}

function Dashboard({ products, onBrowse, onAddProduct, onUpdateProduct, onDeleteProduct, onImportLegacyProducts, onSignOut, onRetryDatabase, databaseConnected, databaseError }) {
  const dashboardRef = useRef(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState(null);
  const [viewingProduct, setViewingProduct] = useState(null);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [actionMenuProductId, setActionMenuProductId] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('All categories');
  const [catalogError, setCatalogError] = useState('');
  const [legacyProducts, setLegacyProducts] = useState(loadLegacyProducts);
  const [importingLegacyProducts, setImportingLegacyProducts] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    brand: '',
    category: 'Everyday',
    price: '',
    note: '',
    processor: '',
    memory: '',
    storage: '',
    image: '',
  });
  const [imageFileName, setImageFileName] = useState('');
  const [imageProcessing, setImageProcessing] = useState(false);
  const averagePrice = products.length
    ? Math.round(products.reduce((total, product) => total + product.price, 0) / products.length)
    : 0;
  const brandCount = new Set(products.map((product) => product.brand)).size;
  const categoryCounts = [...new Set(products.map((product) => product.category))].map((category) => ({
    name: category,
    count: products.filter((product) => product.category === category).length,
  }));
  const filteredDashboardProducts = products.filter((product) => {
    const query = productSearch.trim().toLowerCase();
    const matchesQuery = !query || [product.name, product.brand, product.category].some((value) => value.toLowerCase().includes(query));
    const matchesCategory = productCategoryFilter === 'All categories' || product.category === productCategoryFilter;
    return matchesQuery && matchesCategory;
  });
  const deletingProduct = products.find((product) => product.id === deleteConfirmId);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.from('.dashboard-header, .dashboard-metric, .dashboard-panel', {
      y: 18,
      duration: 0.55,
      stagger: 0.08,
      ease: 'power2.out',
    });
  }, { scope: dashboardRef });

  async function submitProduct(event) {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');

    const product = {
      ...(editingProductId ? { id: editingProductId } : {
        id: `${newProduct.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
      }),
      name: newProduct.name.trim(),
      brand: newProduct.brand.trim().toUpperCase(),
      category: newProduct.category,
      note: newProduct.note.trim() || `NEW ${newProduct.category.toUpperCase()} PICK`,
      price: Number(newProduct.price),
      image: newProduct.image,
      specs: [
        newProduct.processor.trim(),
        newProduct.memory.trim(),
        newProduct.storage.trim(),
      ],
      custom: true,
    };

    if (!product.name || !product.brand || !Number.isSafeInteger(product.price) || product.price < 1
      || product.price > 1000000000 || product.specs.some((spec) => !spec)) {
      setFormError('Add a name, brand, valid price, processor, memory, and storage before saving.');
      return;
    }

    try {
      if (editingProductId) await onUpdateProduct(product);
      else await onAddProduct(product);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The laptop could not be saved.');
      return;
    }

    setNewProduct({ name: '', brand: '', category: 'Everyday', price: '', note: '', processor: '', memory: '', storage: '', image: '' });
    setImageFileName('');
    setEditingProductId(null);
    setAddFormOpen(false);
    setFormSuccess(editingProductId
      ? `${product.name} was updated in the database and storefront.`
      : `${product.name} was saved to the database and added to the storefront.`);
  }

  function editProduct(product) {
    setEditingProductId(product.id);
    setNewProduct({
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: String(product.price),
      note: product.note || '',
      processor: product.specs[0] || '',
      memory: product.specs[1] || '',
      storage: product.specs[2] || '',
      image: product.image || '',
    });
    setImageFileName(product.image ? 'Current photo' : '');
    setAddFormOpen(true);
    setViewingProduct(null);
    setFormError('');
    setFormSuccess('');
    window.setTimeout(() => document.getElementById('admin-product-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  }

  async function importLegacyProducts() {
    setImportingLegacyProducts(true);
    setCatalogError('');
    try {
      await onImportLegacyProducts(legacyProducts);
      localStorage.removeItem('tk-tech-products');
      setLegacyProducts([]);
      setFormSuccess('Your old browser listings were imported into the database.');
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'The old browser listings could not be imported.');
    } finally {
      setImportingLegacyProducts(false);
    }
  }

  async function handleImageSelection(file) {
    setFormError('');
    setFormSuccess('');
    setImageProcessing(true);
    try {
      const image = await compressProductImage(file);
      setNewProduct((current) => ({ ...current, image }));
      setImageFileName(file.name);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The image could not be processed.');
      setNewProduct((current) => ({ ...current, image: '' }));
      setImageFileName('');
    } finally {
      setImageProcessing(false);
    }
  }

  async function deleteProduct(product) {
    setCatalogError('');
    setActionMenuProductId(null);
    try {
      await onDeleteProduct(product.id);
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : `Could not delete ${product.name} from the database.`);
      setDeleteConfirmId(null);
      return;
    }

    setDeleteConfirmId(null);
    setFormSuccess(`${product.name} was deleted from the database and storefront.`);
  }

  async function signOutAdmin() {
    try {
      await onSignOut();
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Could not sign out of the admin panel.');
    }
  }

  return (
    <section className="dashboard-page" ref={dashboardRef} aria-labelledby="dashboard-title">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar-heading"><span className="eyebrow-dot" /> ADMIN CONSOLE</div>
        <a className="dashboard-side-link active" href="#dashboard-overview">Overview <span>01</span></a>
        <a className="dashboard-side-link" href="#dashboard-products">Product catalog <span>{products.length}</span></a>
        <div className="dashboard-sidebar-note">Manage laptop listings, update product details, and keep the storefront catalog current.</div>
        <button className="dashboard-back-link" onClick={onBrowse}>← Back to storefront</button>
        <button className="dashboard-signout-link" onClick={() => void signOutAdmin()}>Sign out</button>
      </aside>
      <div className="dashboard-content" id="dashboard-overview">
        <div className="dashboard-header">
          <div>
            <div className="eyebrow"><span className="eyebrow-dot" /> TK TECH / ADMIN</div>
            <h1 id="dashboard-title">Store <span>overview.</span></h1>
            <p>A quick look at the saved laptop catalog.</p>
          </div>
          <div className="dashboard-header-actions">
            <span className="dashboard-preview-tag">SIGNED IN AS ADMIN</span>
            <button className="button dashboard-add-button" disabled={!databaseConnected} onClick={() => {
              setNewProduct({ name: '', brand: '', category: 'Everyday', price: '', note: '', processor: '', memory: '', storage: '', image: '' });
              setImageFileName('');
              setEditingProductId(null);
              setAddFormOpen(true);
              setFormError('');
              setFormSuccess('');
            }}><Icon name="plus" size={16} /> Add laptop</button>
            <button className="button button-dark" onClick={onBrowse}>View storefront <Icon name="arrow" size={16} /></button>
          </div>
        </div>
        {formSuccess && <div className="dashboard-success" role="status">{formSuccess}</div>}
        {catalogError && <div className="dashboard-form-error" role="alert">{catalogError}</div>}
        {legacyProducts.length > 0 && <div className="dashboard-legacy-import"><span>{legacyProducts.length} older browser {legacyProducts.length === 1 ? 'listing is' : 'listings are'} waiting to be imported.</span><button className="dashboard-inline-link" onClick={() => void importLegacyProducts()} disabled={importingLegacyProducts}>{importingLegacyProducts ? 'Importing…' : 'Import old listings'}</button></div>}
        {addFormOpen && <form className="dashboard-add-form" id="admin-product-form" onSubmit={submitProduct}>
          <div className="dashboard-panel-heading"><div><span className="eyebrow">{editingProductId ? 'UPDATE CATALOG LISTING' : 'NEW CATALOG LISTING'}</span><h2>{editingProductId ? 'Edit laptop' : 'Add a laptop'}</h2></div><button className="icon-button" type="button" onClick={() => { setAddFormOpen(false); setEditingProductId(null); }} aria-label="Close laptop form"><Icon name="close" /></button></div>
          <div className="dashboard-form-grid">
            <label>Product name<input required maxLength="90" value={newProduct.name} onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })} placeholder="e.g. ThinkPad T14" /></label>
            <label>Brand<input required maxLength="40" value={newProduct.brand} onChange={(event) => setNewProduct({ ...newProduct, brand: event.target.value })} placeholder="e.g. Lenovo" /></label>
            <label>Category<select value={newProduct.category} onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}>{categories.slice(1).map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Price (PKR)<input required type="number" min="1" step="1" value={newProduct.price} onChange={(event) => setNewProduct({ ...newProduct, price: event.target.value })} placeholder="e.g. 299999" /></label>
            <label>Product label<input maxLength="80" value={newProduct.note} onChange={(event) => setNewProduct({ ...newProduct, note: event.target.value })} placeholder="e.g. NEW WORK PICK" /></label>
            <label>Processor<input required maxLength="60" value={newProduct.processor} onChange={(event) => setNewProduct({ ...newProduct, processor: event.target.value })} placeholder="e.g. Intel Core Ultra 7" /></label>
            <label>Memory<input required maxLength="40" value={newProduct.memory} onChange={(event) => setNewProduct({ ...newProduct, memory: event.target.value })} placeholder="e.g. 16GB RAM" /></label>
            <label>Storage<input required maxLength="40" value={newProduct.storage} onChange={(event) => setNewProduct({ ...newProduct, storage: event.target.value })} placeholder="e.g. 1TB SSD" /></label>
            <div className="dashboard-image-upload">
              <span className="dashboard-upload-label">Laptop photo <span>(optional)</span></span>
              <label className="dashboard-file-picker">
                <input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void handleImageSelection(file); }} />
                <span>{imageProcessing ? 'Preparing photo…' : imageFileName || 'Choose a photo from this device'}</span>
                <span className="dashboard-file-button">{imageFileName ? 'Change photo' : 'Choose file'}</span>
              </label>
              {newProduct.image && <div className="dashboard-image-preview"><img src={newProduct.image} alt="Selected laptop preview" /><span>Photo ready · resized for the catalog</span><button type="button" onClick={() => { setNewProduct({ ...newProduct, image: '' }); setImageFileName(''); }}>Remove</button></div>}
              <small>JPG, PNG, or WebP · up to 10 MB. The resized photo is saved with this listing.</small>
            </div>
          </div>
          {formError && <p className="dashboard-form-error" role="alert">{formError}</p>}
          <div className="dashboard-form-actions"><p>Saved listings appear in the storefront catalog after saving.</p><button className="button button-dark" type="submit" disabled={imageProcessing || !databaseConnected}>{imageProcessing ? 'Preparing photo…' : editingProductId ? 'Save changes' : 'Save laptop'} <Icon name="check" size={16} /></button></div>
        </form>}
        <div className={`dashboard-notice ${databaseConnected ? '' : 'database-disconnected'}`} role={databaseConnected ? 'note' : 'alert'}>{databaseConnected ? <><strong>Catalog connected:</strong> changes are saved to the website catalog and shown to visitors.</> : <><strong>Catalog unavailable:</strong> {databaseError || 'Reconnect the catalog before adding, editing, or deleting products.'} <button className="catalog-retry-button" onClick={onRetryDatabase}>Reconnect</button></>}</div>
        <div className="dashboard-metrics">
          <article className="dashboard-metric"><span>CATALOG PRODUCTS</span><strong>{products.length.toString().padStart(2, '0')}</strong><small>Saved catalog listings</small></article>
          <article className="dashboard-metric"><span>CATEGORIES</span><strong>{categoryCounts.length.toString().padStart(2, '0')}</strong><small>In the current catalog</small></article>
          <article className="dashboard-metric"><span>BRANDS</span><strong>{brandCount.toString().padStart(2, '0')}</strong><small>Represented in sample listings</small></article>
          <article className="dashboard-metric"><span>AVERAGE LIST PRICE</span><strong>{money(averagePrice)}</strong><small>Catalog list prices · PKR</small></article>
        </div>
        <div className="dashboard-panels">
          <section className="dashboard-panel category-panel">
            <div className="dashboard-panel-heading"><div><span className="eyebrow">CATALOG MIX</span><h2>Products by category</h2></div><span className="dashboard-panel-icon">✳</span></div>
            <div className="category-breakdown">{categoryCounts.map(({ name, count }) => <div className="category-breakdown-row" key={name}><div><span>{name}</span><strong>{count} {count === 1 ? 'product' : 'products'}</strong></div><span className="category-bar"><i style={{ width: `${(count / products.length) * 100}%` }} /></span></div>)}</div>
          </section>
          <section className="dashboard-panel orders-panel">
            <div className="dashboard-panel-heading"><div><span className="eyebrow">QUICK GUIDE</span><h2>Managing your catalog</h2></div><span className="dashboard-panel-icon">✳</span></div>
            <div className="dashboard-guide-list"><p><span>01</span>Add a laptop with its price, specs, and photo.</p><p><span>02</span>Edit a listing to update details on the storefront.</p><p><span>03</span>Use the row’s More menu for less common actions.</p></div>
          </section>
        </div>
        <section className="dashboard-panel dashboard-products-panel" id="dashboard-products">
          <div className="dashboard-panel-heading"><div><span className="eyebrow">CURRENT CATALOG LISTINGS</span><h2>Product catalog</h2></div><button className="dashboard-inline-link" onClick={onBrowse}>Browse products <span>↗</span></button></div>
          <div className="dashboard-catalog-tools">
            <label className="dashboard-catalog-search"><Icon name="search" size={16} /><input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products or brands" aria-label="Search products or brands" /></label>
            <label className="dashboard-catalog-category"><span className="sr-only">Filter by category</span><select value={productCategoryFilter} onChange={(event) => setProductCategoryFilter(event.target.value)}><option>All categories</option>{[...new Set(products.map((product) => product.category))].map((category) => <option key={category}>{category}</option>)}</select></label>
            <span className="dashboard-catalog-count">Showing {filteredDashboardProducts.length} of {products.length}</span>
          </div>
          <div className="dashboard-table-wrap"><table className="dashboard-table"><thead><tr><th>PRODUCT</th><th>BRAND</th><th>CATEGORY</th><th>LIST PRICE</th><th>TYPE</th><th>ACTIONS</th></tr></thead><tbody>{filteredDashboardProducts.length ? filteredDashboardProducts.map((product) => <tr key={product.id}><td><div className="dashboard-product-name">{product.image ? <img src={product.image} alt="" loading="lazy" /> : <span className="dashboard-image-placeholder">TK</span>}<strong>{product.name}</strong></div></td><td>{product.brand}</td><td>{product.category}</td><td>{money(product.price)}</td><td><span className={`sample-status ${product.custom ? 'saved-status' : ''}`}>{product.custom ? 'Custom' : 'Sample'}</span></td><td className="dashboard-row-actions"><div className="dashboard-product-actions"><button className="dashboard-product-action" onClick={() => { setActionMenuProductId(null); setViewingProduct(product); }}>View</button><button className="dashboard-product-action" onClick={() => { setActionMenuProductId(null); editProduct(product); }} disabled={!databaseConnected}>Edit</button>{deleteConfirmId === product.id ? <span className="dashboard-delete-pending">Confirming…</span> : <div className="dashboard-row-menu-wrap"><button className="dashboard-more-button" onClick={() => setActionMenuProductId((current) => current === product.id ? null : product.id)} aria-label={`More actions for ${product.name}`} aria-expanded={actionMenuProductId === product.id} disabled={!databaseConnected}><span aria-hidden="true">⋯</span></button>{actionMenuProductId === product.id && <div className="dashboard-row-menu" role="menu"><button className="dashboard-row-menu-delete" role="menuitem" onClick={() => { setActionMenuProductId(null); setDeleteConfirmId(product.id); setFormSuccess(''); setCatalogError(''); }}>Delete laptop</button></div>}</div>}</div></td></tr>) : <tr><td className="dashboard-empty-row" colSpan="6">{products.length ? 'No laptops match your search.' : 'No products are in the catalog yet.'}</td></tr>}</tbody></table></div>
        </section>
      </div>
      {viewingProduct && <div className="overlay admin-product-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingProduct(null); }}>
        <section className="admin-product-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-product-title">
          <div className="dashboard-panel-heading"><div><span className="eyebrow">PRODUCT DETAILS</span><h2 id="admin-product-title">{viewingProduct.name}</h2></div><button className="icon-button" onClick={() => setViewingProduct(null)} aria-label="Close product details"><Icon name="close" /></button></div>
          {viewingProduct.image ? <img className="admin-product-image" src={viewingProduct.image} alt={`${viewingProduct.name} laptop`} /> : <div className="admin-product-image admin-product-image-empty">TK</div>}
          <dl className="admin-product-details">
            <div><dt>Brand</dt><dd>{viewingProduct.brand}</dd></div>
            <div><dt>Category</dt><dd>{viewingProduct.category}</dd></div>
            <div><dt>Price</dt><dd>{money(viewingProduct.price)}</dd></div>
            <div><dt>Product label</dt><dd>{viewingProduct.note || '—'}</dd></div>
            {viewingProduct.specs.map((spec, index) => <div key={`${viewingProduct.id}-${index}`}><dt>{['Processor', 'Memory', 'Storage'][index]}</dt><dd>{spec}</dd></div>)}
          </dl>
          <button className="button button-dark admin-product-edit" onClick={() => editProduct(viewingProduct)} disabled={!databaseConnected}>Edit product <Icon name="arrow" size={16} /></button>
        </section>
      </div>}
      {deletingProduct && <div className="overlay admin-delete-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteConfirmId(null); }}>
        <section className="admin-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-delete-title" aria-describedby="admin-delete-description">
          <span className="eyebrow">REMOVE CATALOG LISTING</span>
          <h2 id="admin-delete-title">Delete this laptop?</h2>
          <p id="admin-delete-description"><strong>{deletingProduct.name}</strong> will be removed from the product catalog and storefront.</p>
          <div className="admin-delete-dialog-actions"><button className="button" onClick={() => setDeleteConfirmId(null)}>Cancel</button><button className="button admin-delete-final-button" onClick={() => void deleteProduct(deletingProduct)} disabled={!databaseConnected}>Delete laptop</button></div>
        </section>
      </div>}
    </section>
  );
}

function AdminLogin({ onLogin, errorMessage }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submitLogin(event) {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await onLogin({ username, password });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Admin sign-in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login-page">
      <section className="admin-login-card" aria-labelledby="admin-login-title">
        <div className="eyebrow"><span className="eyebrow-dot" /> PRIVATE ADMIN ACCESS</div>
        <h1 id="admin-login-title">Welcome <span>back.</span></h1>
        <p>Sign in to manage the TK Tech laptop catalog.</p>
        {(errorMessage || formError) && <div className="account-error" role="alert">{formError || errorMessage}</div>}
        <form className="account-form" onSubmit={submitLogin}>
          <label htmlFor="admin-username">ADMIN USERNAME<input id="admin-username" name="username" autoComplete="username" required maxLength="40" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label htmlFor="admin-password">PASSWORD<span className="password-input-wrap"><input id="admin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength="128" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="password-visibility-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}><Icon name={showPassword ? 'eyeOff' : 'eye'} size={19} /></button></span></label>
          <button className="button button-dark account-submit" type="submit" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in to admin'} <Icon name="arrow" size={16} /></button>
        </form>
        <p className="account-helper">This admin login is separate from customer accounts.</p>
      </section>
    </main>
  );
}

function App() {
  const siteRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [catalogStatus, setCatalogStatus] = useState('loading');
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [isAdminRoute, setIsAdminRoute] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/admin');
  const [adminUser, setAdminUser] = useState(null);
  const [adminStatus, setAdminStatus] = useState(() => window.location.pathname.replace(/\/+$/, '') === '/admin' ? 'checking' : 'idle');
  const [adminError, setAdminError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All laptops');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('featured');
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('tk-tech-theme') === 'dark' ? 'dark' : 'light';
    } catch (error) {
      console.error('Could not restore saved theme:', error);
      return 'light';
    }
  });
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tk-tech-cart') || '{}');
    } catch (error) {
      console.error('Could not restore saved cart:', error);
      return {};
    }
  });
  const [wishlist, setWishlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tk-tech-wishlist') || '[]');
    } catch (error) {
      console.error('Could not restore saved wishlist:', error);
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutDetails, setCheckoutDetails] = useState({ name: '', phone: '', city: '', address: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [wishlistOnly, setWishlistOnly] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [accountUser, setAccountUser] = useState(null);
  const [accountStatus, setAccountStatus] = useState('loading');
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMode, setAccountMode] = useState('signin');
  const [accountName, setAccountName] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountError, setAccountError] = useState('');
  const [accountSubmitting, setAccountSubmitting] = useState(false);

  useEffect(() => {
    function syncAdminRoute() {
      const onAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin';
      setIsAdminRoute(onAdminRoute);
      if (onAdminRoute) setAdminStatus('checking');
    }

    window.addEventListener('popstate', syncAdminRoute);
    return () => window.removeEventListener('popstate', syncAdminRoute);
  }, []);

  useEffect(() => {
    if (!isAdminRoute) return undefined;
    const controller = new AbortController();

    async function checkAdminSession() {
      try {
        const response = await fetch('/api/admin/auth/me', {
          signal: controller.signal,
          credentials: 'same-origin',
        });
        if (!response.ok) throw new Error(await getApiError(response));
        const result = await response.json();
        if (typeof result.configured !== 'boolean'
          || (result.admin !== null && typeof result.admin?.username !== 'string')) {
          throw new Error('The server returned an invalid admin session.');
        }
        setAdminUser(result.admin);
        setAdminStatus('ready');
        setAdminError(result.configured ? '' : 'Admin login is not configured. Add TK_ADMIN_USERNAME and TK_ADMIN_PASSWORD to .env and restart the API.');
      } catch (error) {
        if (controller.signal.aborted) return;
        setAdminUser(null);
        setAdminStatus('error');
        setAdminError(error instanceof Error ? error.message : 'Could not check the admin session.');
      }
    }

    checkAdminSession();
    return () => controller.abort();
  }, [isAdminRoute]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccount() {
      try {
        const response = await fetch('/api/auth/me', { signal: controller.signal, credentials: 'same-origin' });
        if (!response.ok) throw new Error(await getApiError(response));
        const result = await response.json();
        setAccountUser(result.user);
        setAccountStatus('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Could not check the customer account session:', error);
        setAccountError(error instanceof Error ? error.message : 'Could not check your account. Please try again.');
        setAccountStatus('error');
      }
    }

    loadAccount();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchCatalog() {
      try {
        const response = await fetch('/api/products', { signal: controller.signal });
        if (!response.ok) throw new Error(await getApiError(response));
        if (!response.headers.get('content-type')?.includes('application/json')) {
          throw new Error('The catalog API is not connected. Start the website and database together with “npm run dev”.');
        }

        const catalog = await response.json();
        if (!Array.isArray(catalog)) throw new Error('The server returned an invalid product catalog.');
        setProducts(catalog);

        setCatalogError('');
        setCatalogStatus('connected');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error('Could not load the catalog database:', error);
        setCatalogError(error instanceof Error ? error.message : 'Could not load the catalog database.');
        setCatalogStatus('error');
      }
    }

    fetchCatalog();
    return () => controller.abort();
  }, [catalogRetry]);

  function retryCatalogConnection() {
    setCatalogError('');
    setCatalogStatus('loading');
    setCatalogRetry((attempt) => attempt + 1);
  }

  function openAccountDialog() {
    setAccountMode(accountUser ? 'account' : 'signin');
    setAccountError('');
    setAccountOpen(true);
    setMenuOpen(false);
  }

  async function submitAccountForm(event) {
    event.preventDefault();
    setAccountError('');
    setAccountSubmitting(true);

    try {
      const signingUp = accountMode === 'signup';
      const response = await fetch(`/api/auth/${signingUp ? 'signup' : 'signin'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...(signingUp ? { name: accountName } : {}),
          email: accountEmail,
          password: accountPassword,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));

      const result = await response.json();
      if (!result.user || typeof result.user.id !== 'string') {
        throw new Error('The server returned an invalid account response.');
      }

      setAccountUser(result.user);
      setAccountStatus('ready');
      setAccountMode('account');
      setAccountPassword('');
    } catch (error) {
      console.error('Could not sign in to the customer account:', error);
      setAccountError(error instanceof Error ? error.message : 'Your account request failed. Please try again.');
    } finally {
      setAccountSubmitting(false);
    }
  }

  async function signOutAccount() {
    setAccountError('');
    setAccountSubmitting(true);
    try {
      const response = await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error(await getApiError(response));
      setAccountUser(null);
      setAccountMode('signin');
      setAccountPassword('');
      setAccountStatus('ready');
      setAccountOpen(false);
    } catch (error) {
      console.error('Could not sign out of the customer account:', error);
      setAccountError(error instanceof Error ? error.message : 'Could not sign out. Please try again.');
    } finally {
      setAccountSubmitting(false);
    }
  }

  const visibleProducts = useMemo(() => {
    let result = products.filter((product) => {
      const matchesCategory = activeCategory === 'All laptops' || product.category === activeCategory;
      const query = search.trim().toLowerCase();
      const matchesSearch = !query || `${product.name} ${product.brand} ${product.category} ${product.specs.join(' ')}`.toLowerCase().includes(query);
      return matchesCategory && matchesSearch && (!wishlistOnly || wishlist.includes(product.id));
    });
    if (sort === 'price-low') result = [...result].sort((a, b) => a.price - b.price);
    if (sort === 'price-high') result = [...result].sort((a, b) => b.price - a.price);
    return result;
  }, [products, activeCategory, search, sort, wishlistOnly, wishlist]);

  const cartItems = products.filter((product) => cart[product.id] > 0);
  const cartCount = cartItems.reduce((total, product) => total + cart[product.id], 0);
  const cartTotal = cartItems.reduce((total, product) => total + product.price * cart[product.id], 0);

  useGSAP(() => {
    if (isAdminRoute || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.from('.hero-copy > .eyebrow, .hero-copy h1, .hero-copy > p, .hero-actions, .hero-footnote', {
      y: 22,
      duration: 0.7,
      stagger: 0.1,
      ease: 'power3.out',
    });

    gsap.from('.hero-laptop', {
      y: 18,
      scale: 0.96,
      duration: 1,
      delay: 0.15,
      ease: 'power2.out',
    });

    gsap.to('.hero-circle', {
      y: -16,
      ease: 'none',
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: 0.6,
      },
    });

    gsap.utils.toArray('.trust-strip, .shop-section, .manifesto').forEach((section) => {
      const targets = section.querySelectorAll(
        '.trust-strip > div, .section-heading > *, .shop-controls, .catalog-footnote, .manifesto-portrait, .manifesto-copy > *, .manifesto-aside > *',
      );
      if (!targets.length) return;

      gsap.from(targets, {
        y: 20,
        duration: 0.6,
        stagger: 0.07,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: section,
          start: 'top 88%',
          once: true,
        },
      });
    });

  }, { scope: siteRef, dependencies: [isAdminRoute] });

  useGSAP(() => {
    if (isAdminRoute || catalogStatus !== 'connected' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.from('.product-card', {
      y: 22,
      duration: 0.55,
      stagger: 0.09,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '.product-grid',
        start: 'top 88%',
        once: true,
      },
    });
  }, { scope: siteRef, dependencies: [catalogStatus, isAdminRoute] });

  function updateSearch(value) {
    setSearch(value);
    setActiveCategory('All laptops');
    setWishlistOnly(false);
  }

  function submitSearch(event) {
    event.preventDefault();
    setActiveCategory('All laptops');
    setWishlistOnly(false);
    setMobileSearchOpen(false);
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
  }

  function saveCart(nextCart) {
    setCart(nextCart);
    localStorage.setItem('tk-tech-cart', JSON.stringify(nextCart));
  }

  async function addProduct(product) {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(product),
    });
    if (!response.ok) throw new Error(await getApiError(response));

    const savedProduct = await response.json();
    setProducts((current) => [...current, savedProduct]);
    return savedProduct;
  }

  async function updateProduct(product) {
    const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(product),
    });
    if (!response.ok) throw new Error(await getApiError(response));

    const updatedProduct = await response.json();
    setProducts((current) => current.map((item) => item.id === updatedProduct.id ? updatedProduct : item));
    return updatedProduct;
  }

  async function removeProduct(productId) {
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(await getApiError(response));

    setProducts((current) => current.filter((product) => product.id !== productId));
    const updatedCart = { ...cart };
    delete updatedCart[productId];
    setCart(updatedCart);
    const updatedWishlist = wishlist.filter((id) => id !== productId);
    setWishlist(updatedWishlist);

    localStorage.setItem('tk-tech-cart', JSON.stringify(updatedCart));
    localStorage.setItem('tk-tech-wishlist', JSON.stringify(updatedWishlist));
  }

  async function importLegacyCatalog(legacyProducts) {
    const importedProducts = [];
    for (const product of legacyProducts) {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(product),
      });
      if (response.status === 409) continue;
      if (!response.ok) throw new Error(await getApiError(response));
      importedProducts.push(await response.json());
    }

    setProducts((current) => {
      const productsById = new Map(current.map((product) => [product.id, product]));
      for (const product of importedProducts) productsById.set(product.id, product);
      return [...productsById.values()];
    });
  }

  function addToCart(product) {
    saveCart({ ...cart, [product.id]: (cart[product.id] || 0) + 1 });
    setNotice(`${product.name} added to your bag`);
    window.setTimeout(() => setNotice(''), 2600);
  }

  function updateQuantity(productId, amount) {
    const quantity = (cart[productId] || 0) + amount;
    const nextCart = { ...cart };
    if (quantity <= 0) delete nextCart[productId];
    else nextCart[productId] = quantity;
    saveCart(nextCart);
  }

  function submitWhatsAppOrder(event) {
    event.preventDefault();
    const itemLines = cartItems.map((product) => `• ${product.name} × ${cart[product.id]} — ${money(product.price * cart[product.id])}`);
    const message = [
      'Hi TK Tech, I would like to place an order request:',
      '',
      ...itemLines,
      '',
      `Subtotal: ${money(cartTotal)}`,
      'Please confirm stock, delivery charges, and payment options.',
      '',
      `Name: ${checkoutDetails.name}`,
      `Phone: ${checkoutDetails.phone}`,
      `City: ${checkoutDetails.city}`,
      `Delivery address: ${checkoutDetails.address}`,
    ].join('\n');
    window.open(`https://wa.me/923159255165?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  function toggleWishlist(productId) {
    const nextWishlist = wishlist.includes(productId)
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    setWishlist(nextWishlist);
    localStorage.setItem('tk-tech-wishlist', JSON.stringify(nextWishlist));
  }

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem('tk-tech-theme', nextTheme);
    } catch (error) {
      console.error('Could not save theme preference:', error);
    }
  }

  function jumpToShop(category = 'All laptops') {
    setActiveCategory(category);
    setMenuOpen(false);
    setWishlistOnly(false);
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' });
  }

  function jumpToContact() {
    setMenuOpen(false);
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitContactForm(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const message = String(formData.get('message') || '').trim();
    const text = [`Hi TK Tech, my name is ${name}.`, phone ? `My phone number is ${phone}.` : '', message].filter(Boolean).join('\n\n');
    const contactUrl = new URL(whatsappUrl);
    contactUrl.searchParams.set('text', text);
    window.open(contactUrl.toString(), '_blank', 'noopener,noreferrer');
  }

  function returnHome() {
    setSearch('');
    setActiveCategory('All laptops');
    setWishlistOnly(false);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navigateToStorefront() {
    if (window.location.pathname !== '/') window.history.pushState({}, '', '/');
    setIsAdminRoute(false);
    setAdminError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function signInAdmin(credentials) {
    const response = await fetch('/api/admin/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(credentials),
    });
    if (!response.ok) throw new Error(await getApiError(response));

    const result = await response.json();
    if (typeof result.admin?.username !== 'string') throw new Error('The server returned an invalid admin response.');
    setAdminUser(result.admin);
    setAdminStatus('ready');
    setAdminError('');
  }

  async function signOutAdmin() {
    const response = await fetch('/api/admin/auth/signout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(await getApiError(response));
    setAdminUser(null);
    setAdminStatus('ready');
  }

  if (isAdminRoute) {
    return (
      <div className="site-shell" data-theme={theme}>
        <header className="admin-route-header">
          <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigateToStorefront(); }} aria-label="TK Tech storefront">
            <BrandMark /><span className="brand-caption">TECH BY TAIMUR KHAN</span>
          </a>
          <span className="admin-route-label">PRIVATE ADMIN PORTAL</span>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} /></button>
        </header>
        {adminStatus === 'checking'
          ? <main className="admin-login-page"><div className="catalog-state" role="status">Checking admin access…</div></main>
          : adminUser
            ? <Dashboard
              products={products}
              onBrowse={navigateToStorefront}
              onAddProduct={addProduct}
              onUpdateProduct={updateProduct}
              onDeleteProduct={removeProduct}
              onImportLegacyProducts={importLegacyCatalog}
              onSignOut={signOutAdmin}
              onRetryDatabase={retryCatalogConnection}
              databaseConnected={catalogStatus === 'connected'}
              databaseError={catalogError}
            />
            : <AdminLogin onLogin={signInAdmin} errorMessage={adminError} />}
      </div>
    );
  }

  return (
    <div className="site-shell" data-theme={theme} ref={siteRef}>
      <div className="announcement">
        <span>Thoughtful tech. Better days.</span>
        <span className="announcement-note">Curated for life in Pakistan <span aria-hidden="true">✳</span></span>
      </div>
      <header className="header">
        <button className="icon-button mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Icon name={menuOpen ? 'close' : 'menu'} /></button>
          <a className="brand" href="/" onClick={(event) => { event.preventDefault(); returnHome(); }} aria-label="TK Tech home"><BrandMark /><span className="brand-caption">TECH BY TAIMUR KHAN</span></a>
        <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Main navigation">
          <button onClick={() => jumpToShop()}>Shop all</button>
          <button onClick={() => jumpToShop('Work')}>For work</button>
          <button onClick={() => jumpToShop('Everyday')}>Everyday</button>
          <button onClick={() => jumpToShop('Gaming')}>Gaming</button>
          <button onClick={jumpToContact}>Contact</button>
          <button className="account-nav-link" onClick={openAccountDialog}>{accountUser ? 'My account' : 'Sign in'}</button>
        </nav>
        <div className="header-actions">
          <form className="search-box" role="search" onSubmit={submitSearch}>
            <Icon name="search" size={18} />
            <input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Find your next thing" aria-label="Search laptops" />
            {search && <button className="search-clear" type="button" onClick={() => updateSearch('')} aria-label="Clear search"><Icon name="close" size={15} /></button>}
            <button className="search-submit" type="submit" aria-label="Search"><Icon name="arrow" size={16} /></button>
          </form>
          <button className="icon-button mobile-search-button" onClick={() => setMobileSearchOpen(!mobileSearchOpen)} aria-label="Search laptops"><Icon name={mobileSearchOpen ? 'close' : 'search'} /></button>
          <button className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} /></button>
          <button className={`icon-button wishlist-action ${wishlistOnly ? 'is-selected' : ''}`} onClick={() => { setWishlistOnly(!wishlistOnly); setActiveCategory('All laptops'); setMenuOpen(false); document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth' }); }} aria-label={`${wishlistOnly ? 'Show all laptops' : 'Show wishlist'}, ${wishlist.length} saved items`}><Icon name="heart" />{wishlist.length > 0 && <span className="action-count">{wishlist.length}</span>}</button>
          <button className="icon-button bag-action" onClick={() => { setCheckoutOpen(false); setCartOpen(true); }} aria-label={`Shopping bag, ${cartCount} items`}><Icon name="bag" />{cartCount > 0 && <span className="action-count">{cartCount}</span>}</button>
        </div>
        {mobileSearchOpen && <form className="mobile-search-panel" role="search" onSubmit={submitSearch}><Icon name="search" size={18} /><input autoFocus value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Find your next thing" aria-label="Search laptops" />{search && <button className="search-clear" type="button" onClick={() => updateSearch('')} aria-label="Clear search"><Icon name="close" size={15} /></button>}<button type="submit">Search</button></form>}
      </header>

      <main>
        <>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> GOOD TECH, GOOD ENERGY</div>
            <h1>Find your<br />next <span>thing.</span></h1>
            <p>A really good laptop changes how your day feels. Meet the one that fits yours.</p>
            <div className="hero-actions">
              <button className="button button-dark" onClick={() => jumpToShop()}>Explore laptops <Icon name="arrow" size={16} /></button>
              <span className="hero-note">A little more you.<br />A lot less compromise.</span>
            </div>
            <div className="hero-footnote"><span>01 — 06</span><span className="hero-line" /><span>THE EVERYDAY EDIT</span></div>
          </div>
          <div className="hero-art">
            <div className="hero-circle" />
            <img className="hero-laptop" src="https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1400&q=90" alt="Open laptop on a warm neutral background" />
            <div className="hero-sticker"><span>GOOD<br />CHOICE</span><span className="sticker-star">✳</span></div>
            <div className="hero-image-caption"><span>01 / THE CREATIVE ONE</span><span>SWIPE FOR YOUR MATCH&nbsp; →</span></div>
          </div>
          <div className="hero-side-label">YOUR NEXT CHAPTER STARTS HERE</div>
        </section>

        <section className="trust-strip" aria-label="Shopping benefits">
          <div><span className="trust-icon">↗</span><span>Good tech, <strong>fair prices</strong></span></div>
          <div><span className="trust-icon">✳</span><span>Thoughtfully <strong>picked</strong></span></div>
          <div><span className="trust-icon">♡</span><span>Here to help, <strong>always</strong></span></div>
          <div className="trust-location">MADE FOR PAKISTAN&nbsp; <span>✳</span></div>
        </section>

        <section className="shop-section" id="shop">
          <div className="section-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> THE GOOD STUFF</div>
              <h2>Meet your <span>match.</span></h2>
              <p>Solid picks. No rabbit holes. Just the good ones.</p>
            </div>
            <button className="text-link" onClick={() => { setSearch(''); jumpToShop(); }} aria-label="See all laptops"><span className="see-all-full">See all laptops</span><span className="see-all-short">See all</span><span aria-hidden="true">↗</span></button>
          </div>
          <div className="shop-controls">
            <div className="category-tabs" role="tablist" aria-label="Filter by category">
              {categories.map((category) => <button key={category} className={activeCategory === category ? 'active' : ''} onClick={() => setActiveCategory(category)} role="tab" aria-selected={activeCategory === category}>{category}<span>{category === 'All laptops' ? products.length : products.filter((product) => product.category === category).length}</span></button>)}
            </div>
            <label className="sort-control">SORT BY <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort products"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>
          </div>
          {catalogStatus === 'loading' ? <div className="catalog-state" role="status">Loading laptops from the store database…</div>
            : catalogStatus === 'error' ? <div className="catalog-state catalog-state-error" role="alert">Could not load laptops: {catalogError} <button className="catalog-retry-button" onClick={retryCatalogConnection}>Reconnect</button></div>
              : visibleProducts.length > 0 ? (
            <div className="product-grid">
              {visibleProducts.map((product, index) => (
                <article className="product-card" key={product.id}>
                  <div className="product-image-wrap" style={{ '--image-bg': product.color }}>
                    <span className="product-note">{product.note}</span>
                    <button className={`favorite-button ${wishlist.includes(product.id) ? 'is-favorite' : ''}`} onClick={() => toggleWishlist(product.id)} aria-label={`${wishlist.includes(product.id) ? 'Remove' : 'Add'} ${product.name} ${wishlist.includes(product.id) ? 'from' : 'to'} wishlist`}><Icon name="heart" size={19} /></button>
                    {product.image ? <img src={product.image} alt={`${product.name} laptop`} loading={index > 2 ? 'lazy' : 'eager'} /> : <div className="product-image-placeholder" role="img" aria-label={`${product.name} image coming soon`}><span>tk.</span><small>IMAGE COMING SOON</small></div>}
                    <button className="quick-add" onClick={() => addToCart(product)}>Add to bag <Icon name="plus" size={15} /></button>
                  </div>
                  <div className="product-meta"><span>{product.brand}</span><span>{product.category.toUpperCase()}</span></div>
                  <h3>{product.name}</h3>
                  <p className="product-specs">{product.specs.join(' · ')}</p>
                  <div className="price-row"><strong>{money(product.price)}</strong></div>
                </article>
              ))}
            </div>
          ) : <div className="empty-results"><span>✳</span><h3>{wishlistOnly && wishlist.length === 0 ? 'Nothing saved just yet.' : 'No matches just yet.'}</h3><p>{wishlistOnly && wishlist.length === 0 ? 'Tap the heart on a laptop to save it here.' : 'Try a different search or browse the full edit.'}</p><button className="button button-dark" onClick={() => { setSearch(''); setActiveCategory('All laptops'); setWishlistOnly(false); }}>See all laptops <Icon name="arrow" size={16} /></button></div>}
          <div className="catalog-footnote"><span>SQLITE CATALOG</span><span>SHOWING {visibleProducts.length} OF {products.length} PICKS&nbsp; ✳</span></div>
        </section>

        <section className="manifesto">
          <div className="manifesto-portrait"><img src="/images/taimur-khan.jpg" alt="Taimur Khan, founder of TK Tech" loading="lazy" /><span>TAIMUR KHAN · FOUNDER</span></div>
          <div className="manifesto-copy"><div className="eyebrow"><span className="eyebrow-dot" /> A NOTE FROM TAIMUR</div><h2>Less scrolling.<br />More <span>living.</span></h2><p>Buying a laptop shouldn't feel like a second job. We make the shortlist, so you can get back to the good stuff.</p><button className="manifesto-link" onClick={() => jumpToShop()}>Find your fit <span>↗</span></button></div>
          <div className="manifesto-aside"><span>GOOD TECH ISN'T<br />ABOUT MORE SPECS.</span><span className="manifesto-aside-star">✳</span><span>IT'S ABOUT WHAT<br />YOU DO WITH THEM.</span></div>
        </section>

        <section className="contact-section" id="contact" aria-labelledby="contact-title">
          <div className="contact-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> TALK TO A REAL PERSON</div>
            <h2 id="contact-title">Let’s find your <span>fit.</span></h2>
            <p>Tell us what you need in a laptop. We’ll help you choose the right one.</p>
            <a className="contact-direct" href={whatsappUrl} target="_blank" rel="noreferrer">Message us on WhatsApp <span aria-hidden="true">↗</span></a>
          </div>
          <form className="contact-form" onSubmit={submitContactForm}>
            <div className="contact-form-fields">
              <label>Your name<input name="name" type="text" autoComplete="name" maxLength="80" required /></label>
              <label>Phone number (optional)<input name="phone" type="tel" autoComplete="tel" inputMode="tel" maxLength="30" placeholder="03xx xxxxxxx" /></label>
            </div>
            <label>How can we help?<textarea name="message" rows="4" maxLength="1000" required placeholder="Tell us what you’re looking for…" /></label>
            <button className="button button-dark" type="submit">Send via WhatsApp <Icon name="arrow" size={16} /></button>
            <small>WhatsApp will open with your message ready. You’ll send it there.</small>
          </form>
        </section>

        </>
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="/" onClick={(event) => { event.preventDefault(); returnHome(); }} aria-label="TK Tech home"><BrandMark /><span className="brand-caption">TECH BY TAIMUR KHAN</span></a>
        <span className="footer-note">Good tech for whatever comes next.</span>
        <a className="footer-whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer">WhatsApp&nbsp; · &nbsp;0315 9255165 <span aria-hidden="true">↗</span></a>
        <span className="footer-legal">© 2026 TK TECH&nbsp; · &nbsp;PAKISTAN</span>
      </footer>

      {accountOpen && <div className="overlay account-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !accountSubmitting) setAccountOpen(false); }}>
        <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
          <div className="account-dialog-heading">
            <div>
              <span className="eyebrow"><span className="eyebrow-dot" /> TK TECH ACCOUNT</span>
              <h2 id="account-dialog-title">{accountMode === 'account' && accountUser ? `Welcome, ${accountUser.name}` : 'Your next thing starts here.'}</h2>
            </div>
            <button className="icon-button" type="button" onClick={() => setAccountOpen(false)} aria-label="Close account window" disabled={accountSubmitting}><Icon name="close" /></button>
          </div>
          {accountMode === 'account' && accountUser ? <div className="account-profile">
            <p className="account-profile-email">{accountUser.email}</p>
            <p>Your customer account is active. Saved items and order history are not linked to accounts yet.</p>
            {accountError && <p className="account-error" role="alert">{accountError}</p>}
            <button className="button button-dark account-submit" type="button" onClick={signOutAccount} disabled={accountSubmitting}>{accountSubmitting ? 'Signing out…' : 'Sign out'}</button>
          </div> : <>
            <div className="account-tabs" role="tablist" aria-label="Choose sign-in or sign-up">
              <button type="button" role="tab" aria-selected={accountMode === 'signin'} className={accountMode === 'signin' ? 'active' : ''} onClick={() => { setAccountMode('signin'); setAccountError(''); }}>Sign in</button>
              <button type="button" role="tab" aria-selected={accountMode === 'signup'} className={accountMode === 'signup' ? 'active' : ''} onClick={() => { setAccountMode('signup'); setAccountError(''); }}>Sign up</button>
            </div>
            {accountStatus === 'loading' && <p className="account-helper" role="status">Checking your account…</p>}
            {accountError && <p className="account-error" role="alert">{accountError}</p>}
            <form className="account-form" onSubmit={submitAccountForm}>
              {accountMode === 'signup' && <label>Full name<input type="text" name="name" autoComplete="name" minLength="1" maxLength="80" value={accountName} onChange={(event) => setAccountName(event.target.value)} required disabled={accountSubmitting} /></label>}
              <label>Email address<input type="email" name="email" autoComplete="email" maxLength="254" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} required disabled={accountSubmitting} /></label>
              <label>Password<input type="password" name="password" autoComplete={accountMode === 'signup' ? 'new-password' : 'current-password'} minLength={accountMode === 'signup' ? 8 : 1} maxLength="128" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} required disabled={accountSubmitting} /></label>
              {accountMode === 'signup' && <small className="account-helper">Use at least 8 characters. Your password is stored as a secure hash.</small>}
              <button className="button button-dark account-submit" type="submit" disabled={accountSubmitting || accountStatus === 'loading'}>{accountSubmitting ? 'Please wait…' : accountMode === 'signup' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={16} /></button>
            </form>
          </>}
        </section>
      </div>}

      {notice && <div className="toast" role="status"><Icon name="check" size={17} />{notice}</div>}
      {cartOpen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
        <aside className="cart-drawer" aria-label={checkoutOpen ? 'Checkout details' : 'Shopping bag'}>
          <div className="drawer-heading"><div><span className="eyebrow"><span className="eyebrow-dot" /> YOUR GOOD STUFF</span><h2>Your bag <span>({cartCount})</span></h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Close bag"><Icon name="close" /></button></div>
          {cartItems.length ? checkoutOpen ? <form className="checkout-form" onSubmit={submitWhatsAppOrder}>
            <button className="checkout-back" type="button" onClick={() => setCheckoutOpen(false)}>← Back to bag</button>
            <h3>Where should we deliver?</h3>
            <p>Send your order request to TK Tech on WhatsApp. We’ll confirm stock, delivery charges, and payment with you.</p>
            <label>Full name<input autoComplete="name" required value={checkoutDetails.name} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, name: event.target.value })} /></label>
            <label>Phone number<input type="tel" autoComplete="tel" inputMode="tel" placeholder="03xx xxxxxxx" required value={checkoutDetails.phone} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, phone: event.target.value })} /></label>
            <label>City<input autoComplete="address-level2" required value={checkoutDetails.city} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, city: event.target.value })} /></label>
            <label>Delivery address<textarea autoComplete="street-address" rows="3" required value={checkoutDetails.address} onChange={(event) => setCheckoutDetails({ ...checkoutDetails, address: event.target.value })} /></label>
            <div className="checkout-total"><span>Order subtotal</span><strong>{money(cartTotal)}</strong></div>
            <button className="button button-dark checkout-button" type="submit">Send order request on WhatsApp <Icon name="arrow" size={16} /></button>
          </form> : <>
            <div className="cart-list">{cartItems.map((product) => <div className="cart-item" key={product.id}><img src={product.image} alt="" /><div className="cart-item-info"><strong>{product.name}</strong><span>{money(product.price)}</span><div className="quantity-control"><button onClick={() => updateQuantity(product.id, -1)} aria-label={`Remove one ${product.name}`}><Icon name="minus" size={14} /></button><span>{cart[product.id]}</span><button onClick={() => updateQuantity(product.id, 1)} aria-label={`Add one ${product.name}`}><Icon name="plus" size={14} /></button></div></div><strong className="item-total">{money(product.price * cart[product.id])}</strong></div>)}</div>
            <div className="cart-summary"><div><span>Subtotal</span><strong>{money(cartTotal)}</strong></div><p>Delivery fee and payment method are confirmed with you before the order is final.</p><button className="button button-dark checkout-button" onClick={() => setCheckoutOpen(true)}>Continue to checkout <Icon name="arrow" size={16} /></button></div>
          </> : <div className="cart-empty"><span>✳</span><h3>Your bag's taking a breather.</h3><p>Find a laptop you'll love and it'll show up here.</p><button className="button button-dark" onClick={() => { setCartOpen(false); jumpToShop(); }}>Find your match <Icon name="arrow" size={16} /></button></div>}
          <div className="drawer-footnote">TK TECH&nbsp; · &nbsp;THOUGHTFULLY PICKED</div>
        </aside>
      </div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
