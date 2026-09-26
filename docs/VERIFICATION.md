# Doğrulama kaydı

26 Eylül 2026 — BuildProof / Mera sürümü.

- TypeScript: istemci ve sunucu tip kontrolleri geçti.
- Mera: 3 test; gerçek secp256k1 imza doğrulama, PRF belleğinin sıfırlanması, başarı/hata sonrası imzalama oturumunun kapatılması, aynı PRF'den aynı adres. WebAuthn cihaz töreni mock'tur.
- Solidity: EthereumJS VM üzerinde 48 çağrı/doğrulama; tam fonlama, yanlış stake, tekrar katılım, jüri katılım yasağı, erken çekim, kayıt son tarihi, jüri yetkisi, itiraz, erken/tekrar oy, çoğunluk, azınlık, uygunsuz kazanan, eksik tahsis, tekrar çekim, açık dosya, son iade tarihi ve iptal.
- API: geçici bellekte veritabanı ve bağımsız sunucu; gerçek cüzdan imzasıyla giriş, nonce replay reddi, oturum iptali, proje başlangıç kaydı kilidi, katılım önkoşulu, prompt doğrulama, hash zinciri, kullanıcı izolasyonu, rapor/itiraz ve origin kontrolü.
- Tarayıcı: demo hesabı, proje kaydı, demo katılımı, prompt ve kayıt oluşumu kontrol edildi.
- Canlı passkey cihaz uyumluluğu, gerçek Anthropic, facilitator settlement ve Monad dağıtımı bu ortamda otomatik doğrulanmadı. Gerçek anahtar/adres/fonlarla kabul testi gereklidir.

Demo etiketi ve canlı yapılandırma gereklilikleri arayüzde/README'de belirtilir. Sözleşme testleri bağımsız güvenlik denetiminin yerini tutmaz.
