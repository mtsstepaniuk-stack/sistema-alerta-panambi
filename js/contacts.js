/**
 * Contacts Module
 * Gestiona contactos contra la base de datos SQLite local.
 */

import { showToast, openModal, closeModal } from './modals.js';
import { apiRequest, buildQuery } from './api.js';

let contacts = [];
let stats = { total: 0, activos: 0, instituciones: 0, incompletos: 0 };

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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--rojo)">${error.message}</td></tr>`;
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
        <td><strong>${c.nombre}</strong></td>
        <td><span class="badge ${typeBadgeClass}">${typeLabel}</span></td>
        <td>${c.zona}</td>
        <td>${c.telefono}</td>
        <td><span class="canal-icon" style="${canalClass}">${c.canal}</span></td>
        <td><span class="badge ${statusBadgeClass}">${c.estado}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-ghost btn-sm" onclick="editContact(${c.id})">✏️</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--rojo);" onclick="deleteContact(${c.id})">🗑️</button>
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
  if (!confirm('¿Está seguro de que desea eliminar este contacto de la lista?')) return;

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

  if (!nombre) {
    alert('Por favor ingrese el nombre del contacto.');
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

window.editContact = async (id) => {
  const c = contacts.find(contact => contact.id === id);
  if (!c) return;

  const newName = prompt('Editar nombre:', c.nombre);
  if (newName === null) return;
  const newPhone = prompt("Editar teléfono (deje vacío para '—'):", c.telefono === '—' ? '' : c.telefono);
  if (newPhone === null) return;

  try {
    await apiRequest(`/contactos/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre: newName.trim() || c.nombre, telefono: newPhone.trim() || '—' })
    });
    await renderContacts();
    showToast('Contacto actualizado correctamente.');
  } catch (error) {
    showToast(error.message, true);
  }
};

window.deleteContact = deleteContact;
window.saveNewContact = saveNewContact;
window.addContact = () => openModal('m-add-contacto');

export function initContactsListeners() {
  const searchInput = document.getElementById('contact-search');
  const tipoSelect = document.getElementById('contact-filter-tipo');
  const zonaSelect = document.getElementById('contact-filter-zona');

  searchInput?.addEventListener('input', renderContacts);
  tipoSelect?.addEventListener('change', renderContacts);
  zonaSelect?.addEventListener('change', renderContacts);
}
