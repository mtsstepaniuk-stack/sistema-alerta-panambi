/**
 * Contacts Module
 * Gestiona contactos contra la base de datos SQLite local.
 */

import { showToast, openModal, closeModal } from './modals.js';
import { apiRequest, buildQuery } from './api.js';

let contacts = [];
let stats = { total: 0, activos: 0, instituciones: 0, incompletos: 0 };

const CONTACT_TYPES = ['Vecino ribereño', 'Institución', 'Autoridad'];
const CONTACT_ZONES = [
  'Ribera Norte',
  'Bajo Uruguay',
  'Costa Sur',
  'Zona Alta',
  'Puente',
  'Arroyo',
  'Todo Panambí',
  'Municipal',
];
const CONTACT_CHANNELS = ['📱 WhatsApp', '💬 SMS', '📞 Llamada'];

function ensureContactThemeStyles() {
  if (document.getElementById('contact-theme-fixes')) return;

  const style = document.createElement('style');
  style.id = 'contact-theme-fixes';
  style.textContent = `
    /* Los filtros de Contactos mantienen fondo claro; en modo oscuro
       se fuerza texto oscuro para conservar el contraste. */
    body.dark-theme #contact-filter-tipo,
    body.dark-theme #contact-filter-zona {
      background: #ffffff !important;
      color: #1f2d3d !important;
      -webkit-text-fill-color: #1f2d3d !important;
      border-color: #cdd9e2 !important;
      color-scheme: light;
    }

    body.dark-theme #contact-filter-tipo option,
    body.dark-theme #contact-filter-zona option {
      background: #ffffff !important;
      color: #1f2d3d !important;
      -webkit-text-fill-color: #1f2d3d !important;
    }
  `;

  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureSelectOptions(select, values, leadingValue = null) {
  if (!select) return;
  const existing = new Set(Array.from(select.options).map(option => option.value || option.textContent));

  values.forEach(value => {
    if (existing.has(value)) return;
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if (leadingValue && !Array.from(select.options).some(option => option.value === leadingValue)) {
    const option = document.createElement('option');
    option.value = leadingValue;
    option.textContent = leadingValue;
    select.prepend(option);
  }
}

function ensureContactOptions() {
  ensureSelectOptions(document.getElementById('contact-filter-zona'), CONTACT_ZONES);
  ensureSelectOptions(document.getElementById('new-c-zona'), CONTACT_ZONES);
  ensureSelectOptions(document.getElementById('new-c-tipo'), CONTACT_TYPES);
  ensureSelectOptions(document.getElementById('new-c-canal'), CONTACT_CHANNELS);
}

function ensureEditModal() {
  if (document.getElementById('m-edit-contacto')) return;

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'm-edit-contacto';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-icon" style="background:#EAF2FB;">✏️</div>
      <div class="modal-title">Editar Contacto</div>
      <input type="hidden" id="edit-c-id">

      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="input-group" style="margin-bottom:8px;">
          <label>Nombre Completo *</label>
          <input type="text" id="edit-c-nombre" placeholder="Nombre del contacto">
        </div>

        <div class="input-group" style="margin-bottom:8px;">
          <label>Tipo *</label>
          <select id="edit-c-tipo">
            ${CONTACT_TYPES.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}
          </select>
        </div>

        <div class="input-group" style="margin-bottom:8px;">
          <label>Zona *</label>
          <select id="edit-c-zona">
            ${CONTACT_ZONES.map(zone => `<option value="${escapeHtml(zone)}">${escapeHtml(zone)}</option>`).join('')}
          </select>
        </div>

        <div class="input-group" style="margin-bottom:8px;">
          <label>Teléfono (opcional)</label>
          <input type="text" id="edit-c-telefono" placeholder="Ej: +54 9 376 455-6677">
          <small style="color:var(--texto-sub);font-size:11px;">Si queda vacío, el contacto se marcará como incompleto.</small>
        </div>

        <div class="input-group" style="margin-bottom:0;">
          <label>Canal de Notificación</label>
          <select id="edit-c-canal">
            ${CONTACT_CHANNELS.map(channel => `<option value="${escapeHtml(channel)}">${escapeHtml(channel)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="modal-actions" style="margin-top:24px;">
        <button class="btn btn-ghost" type="button" onclick="closeModal('m-edit-contacto')">Cancelar</button>
        <button class="btn btn-primary btn-lg" type="button" onclick="saveEditedContact()">Guardar Cambios</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal('m-edit-contacto');
  });

  document.body.appendChild(modal);
}

async function loadContacts() {
  const search = document.getElementById('contact-search')?.value || '';
  const tipo = document.getElementById('contact-filter-tipo')?.value || 'Todos los tipos';
  const zona = document.getElementById('contact-filter-zona')?.value || 'Todas las zonas';

  const data = await apiRequest(`/contactos${buildQuery({ search, tipo, zona })}`);
  contacts = data.contactos || [];
  stats = data.stats || stats;
}

export async function renderContacts() {
  const tbody = document.querySelector('#s-contactos tbody');
  const countLabel = document.querySelector('#s-contactos .content span');
  const totalStats = document.querySelector('#s-contactos .kpi-grid');

  if (!tbody) return;

  try {
    await loadContacts();
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--rojo)">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  if (contacts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--texto-sub)">No se encontraron contactos que coincidan con los filtros.</td></tr>`;
  } else {
    contacts.forEach(c => {
      const typeBadgeClass = c.tipo === 'Vecino ribereño' ? 'badge-celeste' : (c.tipo === 'Institución' ? 'badge-naranja' : 'badge-rojo');
      const typeLabel = c.tipo === 'Vecino ribereño' ? 'Vecino' : c.tipo;
      const statusBadgeClass = c.estado === 'Activo' ? 'badge-verde' : 'badge-gris';
      const canalClass = c.canal === 'Sin número' ? 'color:var(--gris-lt)' : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(c.nombre)}</strong></td>
        <td><span class="badge ${typeBadgeClass}">${escapeHtml(typeLabel)}</span></td>
        <td>${escapeHtml(c.zona)}</td>
        <td>${escapeHtml(c.telefono)}</td>
        <td><span class="canal-icon" style="${canalClass}">${escapeHtml(c.canal)}</span></td>
        <td><span class="badge ${statusBadgeClass}">${escapeHtml(c.estado)}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" title="Editar contacto" onclick="editContact(${Number(c.id)})">✏️</button>
            <button class="btn btn-ghost btn-sm" title="Eliminar contacto" style="color:var(--rojo);" onclick="deleteContact(${Number(c.id)})">🗑️</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (countLabel) countLabel.textContent = `Mostrando ${contacts.length} de ${stats.total || contacts.length} contactos`;

  if (totalStats) {
    const cardTotal = totalStats.querySelector('div:nth-child(1) .kpi-value');
    const cardActive = totalStats.querySelector('div:nth-child(2) .kpi-value');
    const cardInst = totalStats.querySelector('div:nth-child(3) .kpi-value');
    const cardIncomplete = totalStats.querySelector('div:nth-child(4) .kpi-value');

    if (cardTotal) cardTotal.textContent = stats.total ?? 0;
    if (cardActive) cardActive.textContent = stats.activos ?? 0;
    if (cardInst) cardInst.textContent = stats.instituciones ?? 0;
    if (cardIncomplete) cardIncomplete.textContent = stats.incompletos ?? 0;
  }
}

export async function deleteContact(id) {
  const contact = contacts.find(item => Number(item.id) === Number(id));
  const name = contact?.nombre ? ` “${contact.nombre}”` : '';
  if (!confirm(`¿Está seguro de que desea eliminar el contacto${name}? Esta acción lo quita de la lista de destinatarios.`)) return;

  try {
    await apiRequest(`/contactos/${id}`, { method: 'DELETE' });
    await renderContacts();
    showToast('Contacto eliminado correctamente.');
  } catch (error) {
    showToast(error.message, true);
  }
}

export async function saveNewContact() {
  const nombre = document.getElementById('new-c-nombre')?.value.trim();
  const tipo = document.getElementById('new-c-tipo')?.value;
  const zona = document.getElementById('new-c-zona')?.value;
  const telefono = document.getElementById('new-c-telefono')?.value.trim() || '—';
  const canal = document.getElementById('new-c-canal')?.value;

  if (!nombre || !tipo || !zona) {
    showToast('Nombre, tipo y zona son obligatorios.', true);
    return;
  }

  try {
    await apiRequest('/contactos', {
      method: 'POST',
      body: JSON.stringify({ nombre, tipo, zona, telefono, canal })
    });

    closeModal('m-add-contacto');
    await renderContacts();
    showToast('Contacto agregado correctamente.');

    if (document.getElementById('new-c-nombre')) document.getElementById('new-c-nombre').value = '';
    if (document.getElementById('new-c-telefono')) document.getElementById('new-c-telefono').value = '';
  } catch (error) {
    showToast(error.message, true);
  }
}

window.editContact = (id) => {
  ensureEditModal();
  const contact = contacts.find(item => Number(item.id) === Number(id));
  if (!contact) {
    showToast('No se encontró el contacto seleccionado.', true);
    return;
  }

  document.getElementById('edit-c-id').value = contact.id;
  document.getElementById('edit-c-nombre').value = contact.nombre || '';
  document.getElementById('edit-c-tipo').value = contact.tipo || CONTACT_TYPES[0];
  document.getElementById('edit-c-zona').value = contact.zona || CONTACT_ZONES[0];
  document.getElementById('edit-c-telefono').value = contact.telefono === '—' ? '' : (contact.telefono || '');

  const editChannel = document.getElementById('edit-c-canal');
  const channel = CONTACT_CHANNELS.includes(contact.canal) ? contact.canal : CONTACT_CHANNELS[0];
  editChannel.value = channel;

  openModal('m-edit-contacto');
};

window.saveEditedContact = async () => {
  const id = Number(document.getElementById('edit-c-id')?.value);
  const nombre = document.getElementById('edit-c-nombre')?.value.trim();
  const tipo = document.getElementById('edit-c-tipo')?.value;
  const zona = document.getElementById('edit-c-zona')?.value;
  const telefono = document.getElementById('edit-c-telefono')?.value.trim() || '—';
  const canal = document.getElementById('edit-c-canal')?.value;

  if (!id || !nombre || !tipo || !zona) {
    showToast('Nombre, tipo y zona son obligatorios.', true);
    return;
  }

  try {
    await apiRequest(`/contactos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre, tipo, zona, telefono, canal })
    });

    closeModal('m-edit-contacto');
    await renderContacts();
    showToast('Contacto actualizado correctamente.');
  } catch (error) {
    showToast(error.message, true);
  }
};

window.deleteContact = deleteContact;
window.saveNewContact = saveNewContact;
window.addContact = () => {
  ensureContactOptions();
  openModal('m-add-contacto');
};

export function initContactsListeners() {
  ensureContactThemeStyles();
  ensureContactOptions();
  ensureEditModal();

  const searchInput = document.getElementById('contact-search');
  const tipoSelect = document.getElementById('contact-filter-tipo');
  const zonaSelect = document.getElementById('contact-filter-zona');

  searchInput?.addEventListener('input', renderContacts);
  tipoSelect?.addEventListener('change', renderContacts);
  zonaSelect?.addEventListener('change', renderContacts);
}
