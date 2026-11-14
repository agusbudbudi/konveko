import type { StaticImageData } from 'next/image';
import appLabel from '@/public/landing/app-label.png';
import appRekonsiliasi from '@/public/landing/app-rekonsiliasi.png';
import appSelesai from '@/public/landing/app-selesai.png';
import appSelisih from '@/public/landing/app-selisih.png';
import appStok from '@/public/landing/app-stok.png';
import appWip from '@/public/landing/app-wip.png';

/**
 * Topic pages: one public page per search need, rendered by <TopicPage>.
 * Adding a page: add an entry here, a thin app/<slug>/page.tsx, and the path to TOPIC_PATHS in lib/site.ts.
 * Keep claims to what the app does today; the examples with numbers are illustrations and say so.
 */
export type Topic = {
  path: string;
  /** Short label for the footer and "Baca juga". */
  nav: string;
  /** One line shown on the "Baca juga" card of other pages. */
  blurb: string;
  /** Paths of the two related topics shown under the FAQ. */
  related: [string, string];
  metaTitle: string;
  description: string;
  kicker: string;
  h1: string;
  intro: string;
  sections: { heading: string; paragraphs: string[]; list?: string[] }[];
  konveko: {
    heading: string;
    intro: string;
    points: { title: string; body: string }[];
  };
  shots: {
    src: StaticImageData;
    alt: string;
    caption: string;
    kind: 'phone' | 'desk';
  }[];
  faq: { q: string; a: string }[];
  /** Prefilled WhatsApp message for this page's buttons. */
  waText: string;
  cta: string;
};

export const TOPICS: Topic[] = [
  {
    path: '/aplikasi-konveksi',
    nav: 'Aplikasi konveksi',
    blurb: 'Apa yang dikerjakan aplikasi konveksi dan apa yang perlu ada sebelum memilih.',
    related: ['/tracking-produksi-konveksi', '/kontrol-penjahit-borongan'],
    metaTitle: 'Aplikasi konveksi untuk tracking produksi dan stok · Konveko',
    description:
      'Konveko adalah aplikasi konveksi untuk mencatat qty di setiap serah-terima lewat scan QR, dari potong sampai rak gudang. Cukup pakai HP Android.',
    kicker: 'Aplikasi konveksi',
    h1: 'Aplikasi konveksi untuk tahu di mana setiap pcs berada.',
    intro:
      'Konveko adalah aplikasi untuk usaha konveksi yang ingin tahu jumlah barang di setiap tahap produksi, bukan hanya di awal dan di akhir. Setiap perpindahan barang dicatat lewat scan QR, jadi selisih ketahuan di tempat terjadinya.',
    sections: [
      {
        heading: 'Apa yang biasanya dikerjakan aplikasi konveksi',
        paragraphs: [
          'Istilah "aplikasi konveksi" dipakai untuk banyak hal: ada yang fokus ke pesanan dan invoice, ada yang ke penggajian, ada yang ke stok bahan. Sebelum memilih, tentukan dulu masalah mana yang paling sering membuat kamu rugi.',
          'Untuk banyak konveksi, masalahnya ada di tengah: barang sudah dipotong dan dibagikan, tapi jumlah yang kembali tidak pernah persis sama, dan tidak ada yang tahu kurangnya di mana. Konveko dibuat untuk bagian ini.',
        ],
        list: [
          'Pesanan dan penjualan: order masuk, invoice, pembayaran. Bukan fokus Konveko.',
          'Produksi: barang ada di tahap mana, di tangan siapa, berapa yang jadi dan berapa yang reject. Ini fokus Konveko.',
          'Gudang barang jadi: stok per rak, barang keluar, retur, stok opname. Ini juga dikerjakan Konveko.',
        ],
      },
      {
        heading: 'Kenapa buku dan Excel berhenti cukup',
        paragraphs: [
          'Buku tulis dan Excel bisa dipakai selama barangnya sedikit dan orangnya sama. Begitu ada beberapa penjahit, tim finishing, dan gudang, tiap bagian punya catatannya sendiri dan angkanya jarang sama.',
          'Yang hilang dari catatan manual bukan angkanya, tapi waktunya. Selisih baru terlihat saat direkap atau saat stok opname, ketika sudah sulit menelusuri di serah-terima mana barangnya berkurang.',
        ],
      },
      {
        heading: 'Yang perlu ada kalau tujuannya mengontrol produksi',
        paragraphs: [
          'Kalau kamu membandingkan beberapa aplikasi, ini hal-hal yang membedakan pencatatan produksi yang bisa dipercaya dari sekadar tabel digital.',
        ],
        list: [
          'Hitungan di setiap serah-terima, bukan hanya di awal dan akhir.',
          'Penerima yang mengonfirmasi jumlah, supaya selisih punya penanggung jawab dan alasan.',
          'Reject dicatat sebagai angka sendiri, tidak hilang begitu saja dari total.',
          'Bisa dipakai di lantai produksi dengan satu tangan, tanpa komputer.',
          'Satu layar yang menunjukkan target potong terurai jadi stok, reject, barang dalam proses, dan selisih.',
        ],
      },
    ],
    konveko: {
      heading: 'Cara kerja Konveko',
      intro: 'Label QR dicetak sekali saat batch dibuat. Setelah itu setiap perpindahan cukup satu scan dan konfirmasi jumlah.',
      points: [
        {
          title: 'Batch dan bundle',
          body: 'Satu rol kain jadi satu batch. Hasil potong per variant jadi bundle berlabel QR.',
        },
        {
          title: 'Scan di jahit dan finishing',
          body: 'Penerima scan label dan mengonfirmasi jumlah. Kalau kurang, selisih langsung ditandai dengan alasannya.',
        },
        {
          title: 'Reject dan rework',
          body: 'Reject dicatat dengan alasan saat selesai jahit dan saat QC. Yang bisa diperbaiki masuk rework.',
        },
        {
          title: 'Stok per pcs dan rak',
          body: 'Barang yang lolos QC diberi label per pcs dan tercatat di rak mana, sampai barang keluar atau retur.',
        },
        {
          title: 'Rekonsiliasi',
          body: 'Target potong selalu sama dengan ready stock, reject, barang dalam proses, dan selisih.',
        },
      ],
    },
    shots: [
      {
        src: appRekonsiliasi,
        kind: 'desk',
        alt: 'Dashboard Rekonsiliasi Konveko: target potong terbagi jadi ready stock, reject, WIP, dan selisih per batch',
        caption: 'Rekonsiliasi semua batch di satu layar (data contoh).',
      },
    ],
    faq: [
      {
        q: 'Apakah Konveko mengurus pesanan dan invoice?',
        a: 'Tidak. Konveko fokus ke pencatatan produksi dan stok barang jadi: dari rol kain, jahit, finishing, sampai rak gudang dan barang keluar.',
      },
      {
        q: 'Perangkat apa yang dibutuhkan?',
        a: 'Untuk scan cukup HP Android atau scanner handheld. Untuk cetak label dan melihat rekonsiliasi di meja, pakai PC atau laptop dan printer label thermal.',
      },
      {
        q: 'Apakah penjahit harus bisa pakai komputer?',
        a: 'Tidak. Penjahit dan tim finishing hanya memakai layar scan di HP: scan label, cek jumlah, konfirmasi.',
      },
      {
        q: 'Apakah data produk lama bisa dimasukkan?',
        a: 'Bisa. Master data seperti variant, rol kain, dan rak bisa diimport lewat Excel.',
      },
    ],
    waText: 'Halo Konveko, saya sedang cari aplikasi konveksi dan mau tanya soal Konveko.',
    cta: 'Mau lihat apakah Konveko cocok untuk konveksi kamu?',
  },
  {
    path: '/kontrol-penjahit-borongan',
    nav: 'Kontrol penjahit borongan',
    blurb: 'Dua hitungan di setiap serah-terima supaya selisih tidak jadi perdebatan.',
    related: ['/tracking-produksi-konveksi', '/label-qr-barcode-konveksi'],
    metaTitle: 'Cara kontrol penjahit borongan agar setoran cocok · Konveko',
    description:
      'Potongan sering kembali kurang dari penjahit dan baru ketahuan belakangan. Catat serah-terima agar selisih dan reject ketahuan saat itu juga.',
    kicker: 'Kontrol penjahit borongan',
    h1: 'Cara kontrol penjahit borongan supaya setoran tidak selisih.',
    intro:
      'Potongan diserahkan ke penjahit, lalu kembali dalam bentuk barang jadi. Di antara dua titik itu jumlahnya sering berubah, dan tanpa catatan di saat serah-terima, tidak ada yang bisa memastikan berkurangnya di siapa.',
    sections: [
      {
        heading: 'Kenapa setoran penjahit sering tidak cocok',
        paragraphs: [
          'Selisih jarang berasal dari satu kejadian besar. Biasanya dari hal kecil yang berulang: potongan memang kurang dari hitungan potong, ada yang tercecer saat dipindah, atau barang rusak dipisahkan tanpa dicatat.',
          'Masalahnya bukan siapa yang salah, tapi tidak ada angka yang disepakati dua pihak pada saat barang berpindah tangan. Tanpa itu, setiap selisih jadi perdebatan.',
        ],
        list: [
          'Jumlah potongan dicatat pemilik, tapi tidak dihitung ulang oleh penjahit saat menerima.',
          'Setoran dicatat total, tanpa memisahkan barang jadi dan reject.',
          'Catatan ada di buku masing-masing, dan baru dicocokkan saat pembayaran atau stok opname.',
        ],
      },
      {
        heading: 'Prinsipnya: dua hitungan di setiap serah-terima',
        paragraphs: [
          'Cara paling sederhana untuk menutup celah ini adalah membuat penerima ikut menghitung. Yang menyerahkan mencatat jumlah kirim, yang menerima mengonfirmasi jumlah terima. Kalau angkanya beda, selisih dicatat saat itu, lengkap dengan alasannya.',
          'Contoh: satu bundle berisi 20 potong diserahkan ke penjahit. Penjahit menghitung dan hanya menemukan 19. Selisih 1 dicatat di serah-terima itu, bukan ditemukan tiga minggu kemudian saat barang jadi dihitung.',
          'Saat penjahit menyetor, hal yang sama berlaku: jumlah jadi ditambah reject harus sama dengan jumlah yang tadi diterima. Dari 19 potong, misalnya 18 jadi dan 1 reject.',
        ],
      },
      {
        heading: 'Kalau masih pakai buku atau Excel',
        paragraphs: ['Prinsip di atas bisa dijalankan tanpa aplikasi. Yang penting disiplinnya, bukan alatnya.'],
        list: [
          'Beri setiap ikatan potongan nomor sendiri, dan tulis jumlahnya di kertas yang ikut dengan barangnya.',
          'Minta penjahit menghitung saat menerima, lalu paraf jumlah yang diterima.',
          'Saat setor, catat jadi dan reject secara terpisah, dan pastikan jumlahnya sama dengan yang diterima.',
          'Rekap per penjahit setiap minggu, jangan menunggu stok opname.',
        ],
      },
    ],
    konveko: {
      heading: 'Cara Konveko mengerjakannya',
      intro: 'Di Konveko, setiap ikatan potongan adalah bundle berlabel QR, dan setiap penjahit punya akun sendiri di HP-nya.',
      points: [
        {
          title: 'Scan terima',
          body: 'Penjahit scan label bundle dan mengonfirmasi jumlah yang diterima. Jumlah acuan sudah terisi.',
        },
        {
          title: 'Kurang langsung ditandai',
          body: 'Kalau jumlahnya kurang, penjahit memilih alasan dan bisa menambah foto. Selisih muncul di meja supervisor.',
        },
        {
          title: 'Scan selesai jahit',
          body: 'Jadi dan reject diisi terpisah, dan jumlahnya harus pas dengan yang diterima sebelum bisa dikonfirmasi.',
        },
        {
          title: 'Tahu barang ada di siapa',
          body: 'Daftar barang dalam proses menunjukkan bundle mana dipegang penjahit mana, dan sudah berapa hari sejak scan terakhir.',
        },
      ],
    },
    shots: [
      {
        src: appSelisih,
        kind: 'phone',
        alt: 'Layar Terima bundle di HP: qty diterima 19 dari 20, peringatan kurang 1 pcs, dan pilihan alasan selisih',
        caption: 'Penjahit menerima 19 dari 20: selisih dicatat dengan alasannya.',
      },
      {
        src: appSelesai,
        kind: 'phone',
        alt: 'Layar Selesai jahit di HP: 18 jadi dan 1 reject dari 19 pcs, dengan pilihan alasan reject',
        caption: 'Saat setor, jadi dan reject harus pas dengan yang diterima.',
      },
    ],
    faq: [
      {
        q: 'Apakah penjahit perlu HP khusus?',
        a: 'Tidak. Cukup HP Android dengan kamera dan browser Chrome. Penjahit masuk dengan nomor HP dan PIN.',
      },
      {
        q: 'Bagaimana kalau penjahit tidak mau repot scan?',
        a: 'Scan dibuat sependek mungkin: scan label, cek jumlah, satu tombol konfirmasi. Kalau label rusak, kode bisa diketik.',
      },
      {
        q: 'Apakah Konveko menghitung upah borongan?',
        a: 'Tidak. Konveko mencatat jumlah yang diterima, jadi, dan reject per bundle. Angka itu bisa kamu pakai sebagai dasar menghitung upah.',
      },
      {
        q: 'Apa yang terjadi setelah selisih dicatat?',
        a: 'Selisih muncul sebagai flag di meja supervisor, lengkap dengan bundle, serah-terima, alasan, dan penerimanya, untuk ditindaklanjuti.',
      },
    ],
    waText: 'Halo Konveko, saya mau tanya soal kontrol penjahit borongan.',
    cta: 'Mau setoran penjahit tercatat rapi tanpa buku?',
  },
  {
    path: '/tracking-produksi-konveksi',
    nav: 'Tracking produksi konveksi',
    blurb: 'Barang ada di tahap mana, di tangan siapa, dan jumlahnya masih sama atau tidak.',
    related: ['/kontrol-penjahit-borongan', '/stok-opname-konveksi'],
    metaTitle: 'Tracking produksi konveksi per tahap dan pemegang · Konveko',
    description:
      'Cara memantau produksi konveksi per tahap, dari rol kain sampai stok: barang ada di siapa, berapa yang jadi, reject, dan di mana selisihnya.',
    kicker: 'Tracking produksi konveksi',
    h1: 'Tracking produksi konveksi: tahu barang ada di tahap mana dan di tangan siapa.',
    intro:
      'Memantau produksi konveksi bukan soal berapa banyak yang dipotong dan berapa yang jadi, tapi soal apa yang terjadi di antaranya. Tracking yang berguna menjawab tiga hal kapan saja: barangnya ada di tahap mana, dipegang siapa, dan jumlahnya masih sama atau tidak.',
    sections: [
      {
        heading: 'Yang perlu dilacak dalam produksi konveksi',
        paragraphs: [
          'Satu rol kain dipotong jadi beberapa ikatan, tiap ikatan berpindah dari potong ke jahit, ke finishing, lalu ke gudang. Di setiap perpindahan ada tiga hal yang bisa berubah: lokasi, pemegang, dan jumlah.',
        ],
        list: [
          'Tahap: siap jahit, proses jahit, siap finishing, proses finishing, sampai stok.',
          'Pemegang: penjahit atau tim finishing mana yang saat ini memegang tiap ikatan.',
          'Jumlah: berapa yang diterima, berapa yang jadi, berapa yang reject, dan berapa yang selisih.',
          'Waktu: sudah berapa lama sebuah ikatan tidak bergerak.',
        ],
      },
      {
        heading: 'Kenapa tracking di awal dan akhir saja tidak cukup',
        paragraphs: [
          'Banyak konveksi hanya mencatat dua titik: jumlah potong di awal dan jumlah barang jadi di akhir. Selisih antara keduanya terlihat, tapi tidak bisa ditelusuri, karena tidak ada catatan tentang apa yang terjadi di tengah.',
          'Tracking per tahap mengubah selisih dari "ada yang kurang 12 pcs" menjadi "kurang 2 pcs di serah-terima ke penjahit B, tanggal sekian, dengan alasan ini". Yang kedua bisa ditindaklanjuti; yang pertama hanya bisa disesali.',
        ],
      },
      {
        heading: 'Cara memulai tanpa aplikasi',
        paragraphs: ['Sistem tracking sederhana bisa dijalankan dengan kertas atau spreadsheet. Syaratnya konsisten.'],
        list: [
          'Beri tiap ikatan kode unik dan tempel di barangnya.',
          'Catat setiap perpindahan: kode, dari siapa, ke siapa, jumlah, dan waktu.',
          'Satu orang atau satu sheet yang menjadi sumber kebenaran, jangan dicatat di banyak tempat.',
          'Setiap hari cek ikatan mana yang tidak bergerak lebih dari tiga hari.',
        ],
      },
    ],
    konveko: {
      heading: 'Cara Konveko melacak produksi',
      intro: 'Setiap ikatan potongan adalah bundle berlabel QR. Tiap scan mencatat siapa, kapan, dan berapa.',
      points: [
        {
          title: 'Barang dalam proses (WIP)',
          body: 'Daftar semua bundle yang belum jadi stok, bisa disaring per tahap dan per pemegang, dengan penanda untuk yang tidak di-scan tiga hari atau lebih.',
        },
        {
          title: 'Lacak apa saja',
          body: 'Ketik sebagian kode batch, bundle, pcs, rak, produk, penjahit, atau rol kain. Hasilnya menunjukkan riwayat siapa memegang apa dan kapan.',
        },
        {
          title: 'Rekonsiliasi per batch',
          body: 'Target potong terurai jadi ready stock, reject, barang dalam proses, dan selisih, sehingga angkanya selalu genap.',
        },
        {
          title: 'Selisih sebagai flag',
          body: 'Qty yang kurang saat serah-terima menjadi flag terbuka dengan alasan dan penerimanya, sampai ditindaklanjuti.',
        },
      ],
    },
    shots: [
      {
        src: appWip,
        kind: 'desk',
        alt: 'Halaman WIP Konveko: daftar bundle belum jadi stok per tahap, dengan pemegang, qty, dan waktu scan terakhir',
        caption: 'Barang dalam proses per tahap dan per pemegang (data contoh).',
      },
      {
        src: appRekonsiliasi,
        kind: 'desk',
        alt: 'Dashboard Rekonsiliasi Konveko: target potong terbagi jadi ready stock, reject, WIP, dan selisih per batch',
        caption: 'Rekonsiliasi semua batch di satu layar (data contoh).',
      },
    ],
    faq: [
      {
        q: 'Apakah perlu scan di setiap tahap?',
        a: 'Ya, di setiap serah-terima: terima dan selesai di jahit, lalu terima dan selesai di finishing. Setiap scan hanya satu label dan satu konfirmasi jumlah.',
      },
      {
        q: 'Bagaimana kalau ada bundle yang lama tidak bergerak?',
        a: 'Halaman WIP menandai bundle yang tidak di-scan tiga hari atau lebih, supaya supervisor bisa menanyakannya sebelum jadi masalah.',
      },
      {
        q: 'Bisa melacak satu pcs, bukan hanya bundle?',
        a: 'Bisa untuk barang jadi: setelah lolos QC, tiap pcs punya label sendiri dan riwayatnya, termasuk rak dan barang keluar, bisa dicari lewat Lacak.',
      },
      {
        q: 'Perangkat apa yang dipakai tim di lapangan?',
        a: 'HP Android dengan kamera, atau scanner handheld. Pemantauan di meja lewat browser di PC atau laptop.',
      },
    ],
    waText: 'Halo Konveko, saya mau tanya soal tracking produksi konveksi.',
    cta: 'Mau tahu barang ada di tahap mana setiap saat?',
  },
  {
    path: '/stok-opname-konveksi',
    nav: 'Stok opname konveksi',
    blurb: 'Hitung buta per rak dan koreksi selisih dengan jejak yang jelas.',
    related: ['/tracking-produksi-konveksi', '/label-qr-barcode-konveksi'],
    metaTitle: 'Stok opname konveksi: hitung buta per rak · Konveko',
    description:
      'Cara stok opname gudang barang jadi konveksi: hitung buta per rak, bandingkan dengan catatan sistem, dan koreksi selisihnya dengan jejak yang jelas.',
    kicker: 'Stok opname konveksi',
    h1: 'Stok opname konveksi: cara menghitung stok gudang tanpa bias.',
    intro:
      'Stok opname seharusnya mencocokkan catatan dengan kenyataan. Dalam praktiknya sering berubah jadi menyesuaikan kenyataan dengan catatan, karena penghitung sudah tahu angka yang "seharusnya". Cara paling sederhana untuk menghindarinya adalah menghitung tanpa melihat angka sistem.',
    sections: [
      {
        heading: 'Kenapa hasil opname sering tidak bisa dipercaya',
        paragraphs: [
          'Penghitung yang tahu angka sistem cenderung berhenti menghitung saat angkanya sudah dekat. Selisih kecil dianggap salah hitung dan dibiarkan, padahal itulah yang menumpuk jadi selisih besar.',
          'Masalah lain: stok bergerak saat dihitung. Kalau ada barang keluar atau masuk rak di tengah opname, selisih yang muncul bukan selisih sebenarnya.',
        ],
        list: [
          'Penghitung melihat angka sistem sebelum atau selama menghitung.',
          'Rak masih dipakai saat dihitung, jadi isinya berubah di tengah jalan.',
          'Barang yang tidak berlabel atau salah rak tidak punya tempat dalam catatan.',
          'Koreksi dilakukan dengan mengubah angka, tanpa jejak siapa dan kenapa.',
        ],
      },
      {
        heading: 'Prinsip opname yang bisa dipercaya',
        paragraphs: [
          'Opname per rak lebih mudah dikontrol daripada opname seluruh gudang sekaligus. Hitung satu rak sampai selesai, tutup, lalu pindah ke rak berikutnya.',
        ],
        list: [
          'Hitung buta: penghitung hanya mencatat apa yang ia temukan, tanpa melihat angka sistem.',
          'Kunci rak selama dihitung, tidak ada barang masuk atau keluar dari rak itu.',
          'Bandingkan setelah semua dihitung, bukan selama.',
          'Tiap temuan dikategorikan: hilang, pindah rak, belum masuk rak, atau salah jenis.',
          'Koreksi disetujui oleh orang yang berbeda dari penghitung, dan tercatat.',
        ],
      },
      {
        heading: 'Contoh alurnya',
        paragraphs: [
          'Gudang memilih tiga rak untuk dihitung hari ini. Petugas scan setiap pcs di rak pertama, tanpa tahu isinya menurut sistem, lalu menutup rak itu dan pindah ke rak kedua.',
          'Setelah semua rak ditutup, supervisor melihat perbandingannya: pcs yang ada di sistem tapi tidak ditemukan, pcs yang ditemukan di rak lain, dan barang tanpa label. Dari situ koreksi disetujui sekaligus, dengan jejak untuk setiap perubahan.',
        ],
      },
    ],
    konveko: {
      heading: 'Cara Konveko menjalankan stok opname',
      intro: 'Opname dibuat per rak, dihitung di HP lewat Scan gudang, dan disetujui supervisor di meja.',
      points: [
        {
          title: 'Pilih rak, rak terkunci',
          body: 'Saat opname berjalan, rak yang dipilih terkunci: tidak ada pcs yang bisa dipindah ke atau dari rak itu.',
        },
        {
          title: 'Hitung buta lewat scan',
          body: 'Petugas gudang scan setiap pcs di rak. Layar hanya menunjukkan berapa yang sudah di-scan, bukan isi menurut sistem.',
        },
        {
          title: 'Barang tanpa label',
          body: 'Barang yang tidak punya label Konveko dicatat dengan variant, kondisi, dan jumlahnya, lalu masuk antrian label.',
        },
        {
          title: 'Review dan setujui',
          body: 'Supervisor melihat temuan per rak: hilang, pindah, belum di rak, dan salah jenis, lalu menyetujui semua koreksi sekaligus.',
        },
        {
          title: 'Koreksi dengan jejak',
          body: 'Pcs yang hilang dicatat lewat dokumen penyesuaian, pcs yang pindah rak dicatat sebagai perpindahan, sehingga riwayat tetap utuh.',
        },
      ],
    },
    shots: [
      {
        src: appStok,
        kind: 'desk',
        alt: 'Halaman Stok per variant Konveko: stok baik, belum di rak, dan reject, dengan isi rak per variant',
        caption: 'Stok per variant dan per rak, dasar pembanding opname (data contoh).',
      },
    ],
    faq: [
      {
        q: 'Apa itu hitung buta?',
        a: 'Petugas menghitung isi rak tanpa melihat jumlah menurut sistem. Setelah rak ditutup, barulah hasil hitungnya dibandingkan dengan catatan di meja supervisor.',
      },
      {
        q: 'Apakah stok bisa tetap bergerak saat opname?',
        a: 'Tidak untuk rak yang sedang dihitung. Rak terkunci selama opname, sehingga selisih yang muncul adalah selisih sebenarnya. Rak lain tetap bisa dipakai.',
      },
      {
        q: 'Bagaimana kalau ada barang tanpa label?',
        a: 'Barang itu dicatat saat opname dengan variant, kondisi, dan jumlahnya. Setelah disetujui, barang itu masuk stok dan label pcs-nya muncul di antrian cetak.',
      },
      {
        q: 'Siapa yang boleh menyetujui koreksi?',
        a: 'Supervisor. Petugas gudang yang menghitung tidak menyetujui sendiri hasil hitungnya.',
      },
    ],
    waText: 'Halo Konveko, saya mau tanya soal stok opname untuk gudang konveksi.',
    cta: 'Mau stok opname yang hasilnya bisa dipercaya?',
  },
  {
    path: '/label-qr-barcode-konveksi',
    nav: 'Label QR konveksi',
    blurb: 'Apa yang dilabeli, kapan dicetak, dan perangkat yang dibutuhkan.',
    related: ['/tracking-produksi-konveksi', '/stok-opname-konveksi'],
    metaTitle: 'Label QR dan barcode untuk konveksi · Konveko',
    description:
      'Panduan label QR dan barcode untuk konveksi: apa yang perlu diberi label, kapan dicetak, dan perangkat apa yang dibutuhkan untuk mencetak dan memindainya.',
    kicker: 'Label QR konveksi',
    h1: 'Label QR dan barcode untuk konveksi: apa yang dilabeli, kapan, dan pakai apa.',
    intro:
      'Pelacakan barang hanya sebaik labelnya. Label yang mudah dicetak, tahan sampai barang berpindah beberapa tangan, dan cepat dipindai membuat tim mau menggunakannya. Label yang merepotkan akan dilewati.',
    sections: [
      {
        heading: 'Apa saja yang perlu diberi label',
        paragraphs: ['Tidak semuanya perlu dilabeli sejak awal. Mulai dari yang paling sering berpindah tangan, lalu tambah sesuai kebutuhan.'],
        list: [
          'Bundle: ikatan potongan yang dibagikan ke penjahit. Ini yang paling penting untuk melacak produksi.',
          'Pcs: barang jadi satuan, supaya stok bisa dilacak per pcs sampai barang keluar.',
          'Rak: kode rak di gudang, supaya memasukkan dan menghitung barang cukup dengan scan.',
        ],
      },
      {
        heading: 'QR atau barcode biasa',
        paragraphs: [
          'Keduanya bisa dipindai kamera HP. QR menyimpan lebih banyak data dan lebih toleran pada label yang sedikit rusak atau terlipat, sedangkan barcode garis lebih cocok kalau pemindai yang dipakai hanya scanner laser lama.',
          'Apa pun jenisnya, yang penting kode di label terhubung ke catatan di sistem, dan ada cara cadangan kalau label rusak, misalnya dengan mengetik kode yang tercetak di bawahnya.',
        ],
      },
      {
        heading: 'Perangkat yang dibutuhkan',
        paragraphs: ['Kebutuhan perangkat untuk label sebenarnya sederhana.'],
        list: [
          'Printer label thermal untuk mencetak. Tidak memakai tinta, dan labelnya tahan sentuhan tangan.',
          'HP Android dengan kamera, atau scanner handheld, untuk memindai.',
          'PC atau laptop untuk menyiapkan dan mengantre cetak di meja.',
        ],
      },
    ],
    konveko: {
      heading: 'Cara Konveko menangani label',
      intro: 'Label dibuat otomatis oleh sistem pada saat yang tepat, dan dicetak dari satu antrian.',
      points: [
        {
          title: 'Label bundle',
          body: 'Saat batch dibuat, setiap bundle langsung punya label QR yang bisa dicetak. Bundle dipecah dulu kalau perlu, lalu dicetak.',
        },
        {
          title: 'Label pcs otomatis',
          body: 'Label per pcs dibuat otomatis saat finishing menyelesaikan scan. Tidak ada yang perlu didaftarkan manual.',
        },
        {
          title: 'Antrian label',
          body: 'Semua label yang belum dicetak ada di satu antrian per bundle, bisa dicetak satu per satu atau sekaligus.',
        },
        {
          title: 'Label rak',
          body: 'Kode rak dicetak dari halaman master data Rak, lalu ditempel di rak gudang.',
        },
        {
          title: 'Label rusak',
          body: 'Kalau label tidak terbaca, petugas bisa mengetik kodenya di layar scan.',
        },
      ],
    },
    shots: [
      {
        src: appLabel,
        kind: 'desk',
        alt: 'Halaman Antrian label Konveko: bundle yang belum dicetak dengan jumlah baik dan reject, dan tombol Cetak semua',
        caption: 'Antrian label: cetak per bundle atau semuanya sekaligus (data contoh).',
      },
    ],
    faq: [
      {
        q: 'Printer apa yang cocok?',
        a: 'Printer label thermal. Tidak memakai tinta atau pita, dan labelnya tahan untuk ditempel di plastik pembungkus barang.',
      },
      {
        q: 'Apakah label harus dicetak satu per satu?',
        a: 'Tidak. Antrian label menampilkan semua bundle yang belum dicetak, dan ada tombol untuk mencetak semuanya sekaligus.',
      },
      {
        q: 'Bagaimana kalau label rusak atau hilang?',
        a: 'Label bisa dicetak ulang dari sistem, dan kalau label tidak terbaca saat scan, kodenya bisa diketik di layar scan.',
      },
      {
        q: 'Apakah perlu mendaftarkan label pcs satu per satu?',
        a: 'Tidak. Label pcs dibuat otomatis saat finishing menyelesaikan scan, jadi cukup dicetak dari antrian.',
      },
    ],
    waText: 'Halo Konveko, saya mau tanya soal label QR dan printer untuk konveksi.',
    cta: 'Mau label QR yang langsung terhubung ke stok?',
  },
];

export const topicByPath = (path: string) => TOPICS.find((t) => t.path === path)!;
