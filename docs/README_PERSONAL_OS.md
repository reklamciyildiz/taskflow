# Axiom — Kişisel İşletim Sistemi (Personal OS)

Bu belge, projeyi **dinamik süreç panosu**, **günlük (journaling)** ve **Bilgi Merkezi (Knowledge Hub)** olarak nasıl kullandığınızı ve teknik olarak nasıl çalıştığını özetler. Başkasına anlatırken veya aylar sonra hatırlamak için referans.

---

## Vizyon

Tek uygulamada: takım görevleri, **sürece özel kolonlar** (iş arama, yazılım projesi vb.), görev başına **öğrenme notları** ve **zaman çizgili günlük** + hepsini arayan bir **second brain** ekranı.

---

## Modlar (Scan vs Do)

- **Dashboard (Scan Mode)**: `/` — Kuş bakışı. Focus Dashboard + Insights + Son bilgiler.
- **Focus Board (Do Mode)**: `/board` — İş yapma modu. Seçili sürecin kanban panosu + ilerleme.

---

## Dinamik kolonlar (süreç / proje)

- Her **proje (süreç)** için `columnConfig` ile pano kolonları tanımlanır (ör. Adaylık → Teknik → Teklif).
- Görevin `status` alanı **metin** olarak bu kolon id’lerinden birine karşılık gelir; eski sabit enum yerine esnek yapı.
- **Terminal kolon**: `isTerminal` veya `done` ile işaretlenen kolonlar “bitti” sayılır; dashboard ve pano üstündeki **ilerleme çubuğu** = terminal kolondaki görev sayısı / o projedeki toplam görev.
- Kodda kolon çözümleme: `resolveTaskBoardColumnId`, `isTerminalBoardColumn`, yedek set: `FALLBACK_BOARD_COLUMNS` (`lib/types`).

---

## Journaling (süreç günlüğü)

- Action panelinde canonical içerikler **Checklist** (`checklist_blocks`) ve bağımsız **Notes** kayıtlarıdır.
- Notes; `note`, `learning`, `idea` ve `decision` tiplerini destekler ve otomatik kaydedilir.

---

## Bilgi Merkezi (Knowledge Hub)

- Rota: `/dashboard/knowledge-hub`.
- Seçili takımın görünür Action metadata, Checklist ve Notes içerikleri Action bazında gruplanır; arama ve süreç/içerik filtresi uygulanır.
- Kaynak veri: canonical scoped query + `buildKnowledgeRetrieval` (`lib/knowledge-retrieval.ts`).
- Karta tıklanınca ilgili görevin düzenleme modalı açılır (`openTaskEditor` — `TaskContext` + shell içindeki `TaskEditModalHost`).

---

## Ana sayfa özet kartları (Dashboard Insights)

- **Son bilgiler**: En yeni Action/Checklist/Notes bağlamları; satıra tıklayınca görev düzenleyici açılır.
- **Aktif süreç özeti**: Seçili takıma göre projeler; aşama sayısı, bitti/toplam, segment bar ve rozetler.

---

## Focus Dashboard (Speed Dial) — tek tıkla not

- Ana sayfada seçtiğin/pinlediğin **3–5 aktif süreç** kart olarak görünür.
- Her kartta “**Hızlı not**” alanına yazıp **Enter**’a basınca, not **modal açmadan** hedef task’ın `journal_logs` alanına eklenir.
- Süreç bazında “**Varsayılan günlük task**” seçebilirsin; seçmezsen sistem “**en son güncellenen task**”ı hedef alır.

---

## Veri ve API (kısa)

- Görevler API/Supabase üzerinden; `learnings` ve `journal_logs` görev kaydının parçası.
- Projeler ve `columnConfig` pano başlıklarını ve terminal bilgisini besler.
- Çoklu takım / org yapısı: görev ve proje filtreleri `teamId` / `organizationId` ile uyumludur.

---

## Kullanım akışı (pratik)

1. Süreç için **proje** oluştur, kolonları tanımla.
2. **/board** sayfasında süreç seç, görevleri sürükle-bırak ile aşamalar arasında taşı. Mobilde kart menüsünden “Statü değiştir” ile hızlı taşıyabilirsin.
3. Önemli anları görevde **günlük** veya **öğrenme** ile yakala.
4. **Bilgi Merkezi** ve ana sayfadaki **Son bilgiler** ile geriye dönük arama yap.

---

*Son güncelleme: Faz 5 + production cilası (boş durumlar, konsol temizliği, bu özet).*
