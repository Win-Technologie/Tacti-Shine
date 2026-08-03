const bookForm = document.getElementById('bookForm');
const bookOk = document.getElementById('bookOk');
const okMsg = document.getElementById('okMsg');

bookForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = bookForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Envoi en cours…';

  const data = Object.fromEntries(new FormData(bookForm).entries());

  try {
    const res = await fetch('https://tacti-shine.onrender.com/api/reserver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error('Échec de l\'envoi');

    okMsg.textContent = 'Demande envoyée!Nous vous contacterons bientot.';
    bookOk.style.display = 'flex';
    bookForm.reset();
  } catch (err) {
    okMsg.textContent = "Erreur lors de l'envoi.Essaie encore ou appelle-nous.";
    bookOk.style.display = 'flex';
    console.error(err);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Envoyer la demande';
  }
});