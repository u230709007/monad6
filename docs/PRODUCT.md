# BuildProof ürün özeti

## Problem

Hackathon jürisi yalnızca son demoyu görür. Takımların etkinlik boyunca ne ürettiği, hangi başlangıçtan geldiği ve AI yardımıyla nasıl ilerlediği dağınıktır.

## Ürün

Mera passkey hesabıyla kayıt olunan, Monad üzerinde katılım teminatı kilitlenen ve geliştirme promptları x402 kontrollü router üzerinden Anthropic'e giden bir çalışma alanı. Jüri kayıtları ve gerekçeli AI raporunu inceler. Sözleşme ödül havuzunu, teminatı, itiraz sürelerini ve kesinti oylarını yönetir.

## Roller

- Katılımcı: passkey, proje beyanı, 1.000 MON katılım, AI kullanımı, itiraz, iade/ödül çekme.
- Jüri: yetkili kayıtlara erişim, analiz raporu, kanıt dosyası açma, çoğunluk oylaması.
- Organizatör: Mera hesabıyla sözleşme oluşturma, 10.000 MON fonlama, kazananlara tahsis, başlamadan iptal.

## İlk sürüm kararları

Tek etkinlik ve tek AI sağlayıcısı. Takım adı profil alanıdır, hesap başına teminat vardır. Backend tek sunucu SQLite; hesap imzası sunucuda doğrulanır. Mera 0.2.0 sabittir. ZeroDev, Kernel veya eski cüzdan akışı kullanılmaz.

## Ekonomi

Ödül 10.000 MON. Katılım 1.000 MON/kişi. Kesinleşmiş ihlalde tüm teminat kesilir. Kesinti sabit hazine adresine gider. AI ödemeleri bağımsız x402 token ödemeleridir. Kullanıcı her çağrıda passkey ile imzalar; sınırsız harcama oturumu yoktur. Sponsorun otomatik bütçe yüklemesi uygulanmamıştır.

## Kanıt sınırı

Prompt geçmişi projenin başlangıç tarihini kanıtlamaz. Kayıt hash zinciri sunucu operatöründen bağımsız değildir; dış zaman damgası/anchoring yoktur. Git başlangıç SHA'sı beyan olarak saklanır ve sonrasında uygulamada kilitlenir. Jüri repo incelemesini kendisi yapar.

## Sonraki ürün işleri

Üye daveti ve takım bazlı raporlar, GitHub App ile doğrulanmış repo snapshot'ları, dış kanıt zaman damgası, x402 sponsor bütçesi, çoklu etkinlik ve denetlenmiş mainnet dağıtımı. Bunlar mevcut sürümde varmış gibi gösterilmez.
