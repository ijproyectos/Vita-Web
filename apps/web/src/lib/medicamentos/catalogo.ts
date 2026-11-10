import { MEDICAMENTOS_POR_CONDICION } from "@/lib/onboarding/catalogo-condiciones";
import { nombreConDroga } from "./nombre";

// Catálogo local de medicamentos frecuentes en Argentina para autocompletar el
// nombre al cargar un remedio. Es solo un listado de nombres (genérico + marcas
// comunes): no trae dosis, indicaciones ni recomendaciones, y el texto libre
// siempre sigue permitido. Módulo de datos puro (sin JSX ni acceso a DB).

export type TipoMedicamento = "pastilla" | "jarabe" | "gotas" | "inyeccion" | "otro";

export type EntradaCatalogo = {
  nombre: string;
  tipo?: TipoMedicamento;
  marcas?: string[];
};

const BASE: EntradaCatalogo[] = [
  // Analgésicos y antiinflamatorios
  { nombre: "Paracetamol", tipo: "pastilla", marcas: ["Tafirol", "Dolofrix", "Termofren"] },
  { nombre: "Ibuprofeno", tipo: "pastilla", marcas: ["Ibupirac", "Actron", "Advil", "Motrin"] },
  { nombre: "Ácido acetilsalicílico", tipo: "pastilla", marcas: ["Aspirina", "Aspirineta", "Cardioaspirina"] },
  { nombre: "Diclofenac", tipo: "pastilla", marcas: ["Voltaren", "Cataflam", "Diclofenac Sódico"] },
  { nombre: "Naproxeno", tipo: "pastilla", marcas: ["Flanax", "Naprux"] },
  { nombre: "Ketorolac", tipo: "pastilla", marcas: ["Dolten", "Ketorolac Trometamina"] },
  { nombre: "Meloxicam", tipo: "pastilla", marcas: ["Mobic", "Melcam"] },
  { nombre: "Celecoxib", tipo: "pastilla", marcas: ["Celebrex"] },
  { nombre: "Tramadol", tipo: "pastilla", marcas: ["Tramal", "Tramadol Gotas"] },
  { nombre: "Dipirona", tipo: "pastilla", marcas: ["Novalgina", "Conmel"] },
  { nombre: "Pregabalina", tipo: "pastilla", marcas: ["Lyrica", "Pregabalina Raffo"] },
  { nombre: "Gabapentina", tipo: "pastilla", marcas: ["Neurontin", "Gabapentin"] },
  // Presión y corazón
  { nombre: "Enalapril", tipo: "pastilla", marcas: ["Renitec", "Lotrial"] },
  { nombre: "Losartán", tipo: "pastilla", marcas: ["Cozaar", "Losacor", "Losartan Potásico"] },
  { nombre: "Valsartán", tipo: "pastilla", marcas: ["Diovan"] },
  { nombre: "Telmisartán", tipo: "pastilla", marcas: ["Micardis"] },
  { nombre: "Candesartán", tipo: "pastilla", marcas: ["Atacand"] },
  { nombre: "Irbesartán", tipo: "pastilla", marcas: ["Aprovel"] },
  { nombre: "Ramipril", tipo: "pastilla", marcas: ["Tritace", "Ramipril Raffo"] },
  { nombre: "Lisinopril", tipo: "pastilla", marcas: ["Zestril", "Prinivil"] },
  { nombre: "Amlodipina", tipo: "pastilla", marcas: ["Norvasc", "Amlodipina Raffo"] },
  { nombre: "Nifedipina", tipo: "pastilla", marcas: ["Adalat"] },
  { nombre: "Atenolol", tipo: "pastilla", marcas: ["Tenormin", "Atenolol Raffo"] },
  { nombre: "Bisoprolol", tipo: "pastilla", marcas: ["Concor", "Bisoprolol Raffo"] },
  { nombre: "Carvedilol", tipo: "pastilla", marcas: ["Dilatrend", "Carvedilol Raffo"] },
  { nombre: "Metoprolol", tipo: "pastilla", marcas: ["Lopresor", "Metoprolol Succinato"] },
  { nombre: "Propranolol", tipo: "pastilla", marcas: ["Inderal"] },
  { nombre: "Nebivolol", tipo: "pastilla", marcas: ["Nebilet"] },
  { nombre: "Furosemida", tipo: "pastilla", marcas: ["Lasix", "Furosemida Raffo"] },
  { nombre: "Hidroclorotiazida", tipo: "pastilla", marcas: ["Hidrosaluretil"] },
  { nombre: "Espironolactona", tipo: "pastilla", marcas: ["Aldactone"] },
  { nombre: "Clortalidona", tipo: "pastilla", marcas: ["Higroton"] },
  { nombre: "Indapamida", tipo: "pastilla", marcas: ["Natrilix"] },
  { nombre: "Amiodarona", tipo: "pastilla", marcas: ["Ancoron", "Cordarone"] },
  { nombre: "Digoxina", tipo: "pastilla", marcas: ["Lanoxin"] },
  { nombre: "Isosorbide", tipo: "pastilla", marcas: ["Isordil", "Mononitrato de Isosorbide"] },
  { nombre: "Clonidina", tipo: "pastilla", marcas: ["Catapresan"] },
  { nombre: "Doxazosina", tipo: "pastilla", marcas: ["Cardura"] },
  // Colesterol y anticoagulantes
  { nombre: "Atorvastatina", tipo: "pastilla", marcas: ["Lipitor", "Atorvastatina Raffo", "Atenativ"] },
  { nombre: "Rosuvastatina", tipo: "pastilla", marcas: ["Crestor", "Rosuvastatina Raffo"] },
  { nombre: "Simvastatina", tipo: "pastilla", marcas: ["Zocor", "Simvastatina Raffo"] },
  { nombre: "Pravastatina", tipo: "pastilla", marcas: ["Pravacol"] },
  { nombre: "Ezetimibe", tipo: "pastilla", marcas: ["Ezetrol"] },
  { nombre: "Fenofibrato", tipo: "pastilla", marcas: ["Lipanthyl"] },
  { nombre: "Acenocumarol", tipo: "pastilla", marcas: ["Sintrom", "Neosintrom"] },
  { nombre: "Warfarina", tipo: "pastilla", marcas: ["Coumadin"] },
  { nombre: "Clopidogrel", tipo: "pastilla", marcas: ["Plavix", "Iscover"] },
  { nombre: "Rivaroxabán", tipo: "pastilla", marcas: ["Xarelto"] },
  { nombre: "Apixabán", tipo: "pastilla", marcas: ["Eliquis"] },
  // Diabetes
  { nombre: "Metformina", tipo: "pastilla", marcas: ["Glucophage", "Dabex", "Metformina Raffo"] },
  { nombre: "Glibenclamida", tipo: "pastilla", marcas: ["Daonil", "Euglucon"] },
  { nombre: "Glimepirida", tipo: "pastilla", marcas: ["Amaryl"] },
  { nombre: "Gliclazida", tipo: "pastilla", marcas: ["Diamicron"] },
  { nombre: "Sitagliptina", tipo: "pastilla", marcas: ["Januvia"] },
  { nombre: "Vildagliptina", tipo: "pastilla", marcas: ["Galvus"] },
  { nombre: "Empagliflozina", tipo: "pastilla", marcas: ["Jardiance"] },
  { nombre: "Dapagliflozina", tipo: "pastilla", marcas: ["Forxiga"] },
  { nombre: "Pioglitazona", tipo: "pastilla", marcas: ["Actos"] },
  { nombre: "Insulina", tipo: "inyeccion", marcas: ["Lantus", "Novorapid", "Humalog", "Tresiba", "Levemir", "Insulina NPH"] },
  { nombre: "Semaglutida", tipo: "inyeccion", marcas: ["Ozempic"] },
  // Tiroides
  { nombre: "Levotiroxina", tipo: "pastilla", marcas: ["Eutirox", "T4", "Levothroid", "Levotiroxina Sódica"] },
  { nombre: "Metimazol", tipo: "pastilla", marcas: ["Danantizol", "Tapazol"] },
  // Estómago
  { nombre: "Omeprazol", tipo: "pastilla", marcas: ["Prilosec", "Gastrimut", "Omeprazol Raffo"] },
  { nombre: "Pantoprazol", tipo: "pastilla", marcas: ["Pantoc", "Ulcozol"] },
  { nombre: "Esomeprazol", tipo: "pastilla", marcas: ["Nexium"] },
  { nombre: "Lansoprazol", tipo: "pastilla", marcas: ["Lanzol"] },
  { nombre: "Ranitidina", tipo: "pastilla", marcas: ["Zantac"] },
  { nombre: "Domperidona", tipo: "pastilla", marcas: ["Motilium"] },
  { nombre: "Metoclopramida", tipo: "pastilla", marcas: ["Reliveran", "Plasil"] },
  { nombre: "Ondansetrón", tipo: "pastilla", marcas: ["Zofran"] },
  { nombre: "Loperamida", tipo: "pastilla", marcas: ["Imodium"] },
  { nombre: "Butilescopolamina", tipo: "pastilla", marcas: ["Buscapina"] },
  { nombre: "Mesalazina", tipo: "pastilla", marcas: ["Asacol", "Salofalk"] },
  // Antibióticos y antivirales
  { nombre: "Amoxicilina", tipo: "pastilla", marcas: ["Amoxidal", "Amoxil", "Optamox"] },
  { nombre: "Amoxicilina con ácido clavulánico", tipo: "pastilla", marcas: ["Augmentine", "Clavulin", "Amoxidal Duo"] },
  { nombre: "Azitromicina", tipo: "pastilla", marcas: ["Zitromax", "Azitromicina Raffo"] },
  { nombre: "Claritromicina", tipo: "pastilla", marcas: ["Klaricid"] },
  { nombre: "Ciprofloxacina", tipo: "pastilla", marcas: ["Ciprofloxacina Raffo", "Ciprobay"] },
  { nombre: "Levofloxacina", tipo: "pastilla", marcas: ["Tavanic"] },
  { nombre: "Cefalexina", tipo: "pastilla", marcas: ["Keflex"] },
  { nombre: "Cefuroxima", tipo: "pastilla", marcas: ["Zinnat"] },
  { nombre: "Ceftriaxona", tipo: "inyeccion", marcas: ["Rocephin"] },
  { nombre: "Doxiciclina", tipo: "pastilla", marcas: ["Vibramicina"] },
  { nombre: "Metronidazol", tipo: "pastilla", marcas: ["Flagyl"] },
  { nombre: "Nitrofurantoína", tipo: "pastilla", marcas: ["Macrodantina"] },
  { nombre: "Trimetoprima con sulfametoxazol", tipo: "pastilla", marcas: ["Bactrim", "Septrin"] },
  { nombre: "Fluconazol", tipo: "pastilla", marcas: ["Diflucan"] },
  { nombre: "Aciclovir", tipo: "pastilla", marcas: ["Zovirax"] },
  { nombre: "Oseltamivir", tipo: "pastilla", marcas: ["Tamiflu"] },
  { nombre: "Ivermectina", tipo: "pastilla", marcas: ["Ivermectina Raffo"] },
  // Alergias y respiratorio
  { nombre: "Loratadina", tipo: "pastilla", marcas: ["Clarityne", "Loratadina Raffo"] },
  { nombre: "Cetirizina", tipo: "pastilla", marcas: ["Zyrtec", "Cetirizina Raffo"] },
  { nombre: "Desloratadina", tipo: "pastilla", marcas: ["Aerius"] },
  { nombre: "Fexofenadina", tipo: "pastilla", marcas: ["Allegra"] },
  { nombre: "Difenhidramina", tipo: "jarabe", marcas: ["Benadryl"] },
  { nombre: "Salbutamol", tipo: "otro", marcas: ["Ventolin", "Salbutamol Aerosol"] },
  { nombre: "Budesonida", tipo: "otro", marcas: ["Pulmicort", "Symbicort"] },
  { nombre: "Tiotropio", tipo: "otro", marcas: ["Spiriva"] },
  { nombre: "Montelukast", tipo: "pastilla", marcas: ["Singulair"] },
  { nombre: "Ambroxol", tipo: "jarabe", marcas: ["Mucosolvan"] },
  { nombre: "Bromhexina", tipo: "jarabe", marcas: ["Bisolvon"] },
  { nombre: "Acetilcisteína", tipo: "jarabe", marcas: ["Fluimucil"] },
  { nombre: "Dextrometorfano", tipo: "jarabe" },
  { nombre: "Fluticasona", tipo: "otro", marcas: ["Flixonase", "Avamys", "Seretide"] },
  // Corticoides
  { nombre: "Prednisona", tipo: "pastilla", marcas: ["Meticorten"] },
  { nombre: "Prednisolona", tipo: "pastilla", marcas: ["Predsol"] },
  { nombre: "Metilprednisolona", tipo: "pastilla", marcas: ["Medrol", "Depo-Medrol"] },
  { nombre: "Dexametasona", tipo: "pastilla", marcas: ["Decadron", "Dexametasona Raffo"] },
  { nombre: "Betametasona", tipo: "pastilla", marcas: ["Celestone"] },
  { nombre: "Deflazacort", tipo: "pastilla", marcas: ["Flantadin"] },
  // Salud mental y sueño
  { nombre: "Clonazepam", tipo: "pastilla", marcas: ["Rivotril", "Clonagin", "Clonazepam Gotas"] },
  { nombre: "Alprazolam", tipo: "pastilla", marcas: ["Alplax", "Xanax", "Trankimazin"] },
  { nombre: "Lorazepam", tipo: "pastilla", marcas: ["Ativan"] },
  { nombre: "Bromazepam", tipo: "pastilla", marcas: ["Lexotanil"] },
  { nombre: "Diazepam", tipo: "pastilla", marcas: ["Valium"] },
  { nombre: "Zolpidem", tipo: "pastilla", marcas: ["Stilnox", "Zolpidem Raffo"] },
  { nombre: "Sertralina", tipo: "pastilla", marcas: ["Zoloft", "Sertralina Raffo"] },
  { nombre: "Escitalopram", tipo: "pastilla", marcas: ["Lexapro", "Escitalopram Raffo"] },
  { nombre: "Fluoxetina", tipo: "pastilla", marcas: ["Prozac", "Foxetin"] },
  { nombre: "Paroxetina", tipo: "pastilla", marcas: ["Paxil"] },
  { nombre: "Venlafaxina", tipo: "pastilla", marcas: ["Efexor"] },
  { nombre: "Duloxetina", tipo: "pastilla", marcas: ["Cymbalta"] },
  { nombre: "Mirtazapina", tipo: "pastilla", marcas: ["Remeron"] },
  { nombre: "Amitriptilina", tipo: "pastilla", marcas: ["Tryptanol"] },
  { nombre: "Trazodona", tipo: "pastilla", marcas: ["Desyrel"] },
  { nombre: "Quetiapina", tipo: "pastilla", marcas: ["Seroquel"] },
  { nombre: "Risperidona", tipo: "pastilla", marcas: ["Risperdal"] },
  { nombre: "Olanzapina", tipo: "pastilla", marcas: ["Zyprexa"] },
  { nombre: "Haloperidol", tipo: "gotas", marcas: ["Halopidol"] },
  { nombre: "Litio", tipo: "pastilla", marcas: ["Carbolitio"] },
  { nombre: "Melatonina", tipo: "pastilla", marcas: ["Melatol"] },
  // Neurología
  { nombre: "Levodopa/Carbidopa", tipo: "pastilla", marcas: ["Sinemet", "Madopar", "Levodopa Carbidopa"] },
  { nombre: "Pramipexol", tipo: "pastilla", marcas: ["Mirapex"] },
  { nombre: "Rasagilina", tipo: "pastilla", marcas: ["Azilect"] },
  { nombre: "Biperideno", tipo: "pastilla", marcas: ["Akineton"] },
  { nombre: "Donepezilo", tipo: "pastilla", marcas: ["Aricept", "Donepezilo Raffo"] },
  { nombre: "Memantina", tipo: "pastilla", marcas: ["Ebixa", "Memantina Raffo"] },
  { nombre: "Rivastigmina", tipo: "pastilla", marcas: ["Exelon"] },
  { nombre: "Carbamazepina", tipo: "pastilla", marcas: ["Tegretol"] },
  { nombre: "Ácido valproico", tipo: "pastilla", marcas: ["Depakene", "Valcote"] },
  { nombre: "Lamotrigina", tipo: "pastilla", marcas: ["Lamictal"] },
  { nombre: "Levetiracetam", tipo: "pastilla", marcas: ["Keppra"] },
  { nombre: "Fenitoína", tipo: "pastilla", marcas: ["Epamin"] },
  { nombre: "Topiramato", tipo: "pastilla", marcas: ["Topamax"] },
  { nombre: "Sumatriptán", tipo: "pastilla", marcas: ["Imigran"] },
  // Huesos, gota, reuma
  { nombre: "Alendronato", tipo: "pastilla", marcas: ["Fosamax"] },
  { nombre: "Calcio con vitamina D", tipo: "pastilla", marcas: ["Calcio D", "Caltrate"] },
  { nombre: "Vitamina D", tipo: "gotas", marcas: ["Calcifediol", "Ricaps"] },
  { nombre: "Alopurinol", tipo: "pastilla", marcas: ["Zyloric"] },
  { nombre: "Colchicina", tipo: "pastilla", marcas: ["Colchicina Raffo"] },
  { nombre: "Metotrexato", tipo: "pastilla", marcas: ["Ledertrexate"] },
  { nombre: "Hidroxicloroquina", tipo: "pastilla", marcas: ["Dolquine", "Plaquenil"] },
  { nombre: "Ciclobenzaprina", tipo: "pastilla", marcas: ["Flexeril"] },
  { nombre: "Tizanidina", tipo: "pastilla", marcas: ["Sirdalud"] },
  // Próstata, urinario, hormonas
  { nombre: "Tamsulosina", tipo: "pastilla", marcas: ["Omnic", "Flomax"] },
  { nombre: "Finasteride", tipo: "pastilla", marcas: ["Proscar", "Propecia"] },
  { nombre: "Dutasteride", tipo: "pastilla", marcas: ["Avodart"] },
  { nombre: "Oxibutinina", tipo: "pastilla", marcas: ["Ditropan"] },
  { nombre: "Solifenacina", tipo: "pastilla", marcas: ["Vesicare"] },
  { nombre: "Sildenafil", tipo: "pastilla", marcas: ["Viagra"] },
  { nombre: "Tadalafil", tipo: "pastilla", marcas: ["Cialis"] },
  { nombre: "Estradiol", tipo: "pastilla", marcas: ["Estrofem"] },
  { nombre: "Levonorgestrel con etinilestradiol", tipo: "pastilla", marcas: ["Microgynon", "Anticonceptivo"] },
  { nombre: "Anastrozol", tipo: "pastilla", marcas: ["Arimidex"] },
  { nombre: "Tamoxifeno", tipo: "pastilla", marcas: ["Nolvadex"] },
  // Suplementos y otros
  { nombre: "Hierro", tipo: "pastilla", marcas: ["Ferrum Hausmann", "Sulfato ferroso"] },
  { nombre: "Ácido fólico", tipo: "pastilla", marcas: ["Folidoce"] },
  { nombre: "Vitamina B12", tipo: "inyeccion", marcas: ["Cianocobalamina", "Dexabión"] },
  { nombre: "Omega 3", tipo: "pastilla", marcas: ["Omegaven"] },
  { nombre: "Magnesio", tipo: "pastilla", marcas: ["Magnesio Quelado"] },
  { nombre: "Potasio", tipo: "pastilla", marcas: ["Cloruro de potasio"] },
  { nombre: "Heparina", tipo: "inyeccion", marcas: ["Clexane", "Enoxaparina"] },
  { nombre: "Lágrimas artificiales", tipo: "gotas", marcas: ["Systane", "Hylo"] },
  { nombre: "Latanoprost", tipo: "gotas", marcas: ["Xalatan"] },
  { nombre: "Timolol", tipo: "gotas", marcas: ["Timoptol"] },
  { nombre: "Brimonidina", tipo: "gotas", marcas: ["Alphagan"] },
  { nombre: "Nistatina", tipo: "gotas", marcas: ["Micostatin"] },
  { nombre: "Lactulosa", tipo: "jarabe", marcas: ["Duphalac"] },
  { nombre: "Simeticona", tipo: "gotas", marcas: ["Espumil", "Luftal"] },
  { nombre: "Sales de rehidratación", tipo: "otro", marcas: ["Rehidrat"] },
];

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Nombres de la encuesta de onboarding que el catálogo base todavía no trae
// (ni como genérico ni como marca): se suman acá para tener una sola fuente.
function desdeCondiciones(): EntradaCatalogo[] {
  const conocidos = new Set<string>();
  for (const e of BASE) {
    conocidos.add(normalizar(e.nombre));
    for (const m of e.marcas ?? []) conocidos.add(normalizar(m));
  }
  const extra: EntradaCatalogo[] = [];
  for (const lista of Object.values(MEDICAMENTOS_POR_CONDICION)) {
    for (const m of lista) {
      if (m.nombre === "Otro") continue;
      const clave = normalizar(m.nombre);
      if (conocidos.has(clave)) continue;
      conocidos.add(clave);
      extra.push({ nombre: m.nombre, tipo: "pastilla" });
    }
  }
  return extra;
}

export const CATALOGO_MEDICAMENTOS: readonly EntradaCatalogo[] = [...BASE, ...desdeCondiciones()];

type Indexada = { entrada: EntradaCatalogo; nombreN: string; marcasN: { marca: string; n: string }[] };

const INDICE: Indexada[] = CATALOGO_MEDICAMENTOS.map((entrada) => ({
  entrada,
  nombreN: normalizar(entrada.nombre),
  marcasN: (entrada.marcas ?? []).map((marca) => ({ marca, n: normalizar(marca) })),
}));

export type Sugerencia = {
  /** Nombre genérico: lo que se completa en el campo al elegir. */
  nombre: string;
  /** Marca por la que coincidió la búsqueda, si fue por marca. */
  marca?: string;
  tipo?: TipoMedicamento;
};

export const MINIMO_CARACTERES_SUGERENCIA = 2;

/**
 * Lo que queda escrito al elegir una sugerencia: "Ibupirac (Ibuprofeno)" si
 * coincidió por marca (lo de paréntesis es la droga), o el genérico solo.
 */
export function etiquetaSugerencia(s: Sugerencia): string {
  return s.marca ? nombreConDroga(s.marca, s.nombre) : s.nombre;
}

/**
 * Sugerencias como las especialidades de turnos: filtra por cualquier parte
 * del nombre comercial o del genérico ("gliflo" encuentra Dapagliflozina), sin
 * importar mayúsculas ni acentos. Primero los que EMPIEZAN con el texto,
 * después los que lo contienen; cada grupo en orden alfabético de lo que se
 * muestra. Una marca y su genérico son filas distintas: si la persona conoce
 * el remedio por la marca, la ve como "Forxiga" (con la droga abajo).
 */
export function sugerirMedicamentos(texto: string, limite = 6): Sugerencia[] {
  const q = normalizar(texto);
  if (q.length < MINIMO_CARACTERES_SUGERENCIA || limite <= 0) return [];
  const empiezan: Sugerencia[] = [];
  const contienen: Sugerencia[] = [];
  const sumar = (n: string, s: Sugerencia) => {
    if (n.startsWith(q)) empiezan.push(s);
    else if (n.includes(q)) contienen.push(s);
  };
  for (const { entrada, nombreN, marcasN } of INDICE) {
    sumar(nombreN, { nombre: entrada.nombre, tipo: entrada.tipo });
    for (const m of marcasN) sumar(m.n, { nombre: entrada.nombre, marca: m.marca, tipo: entrada.tipo });
  }
  const alfabetico = (a: Sugerencia, b: Sugerencia) =>
    (a.marca ?? a.nombre).localeCompare(b.marca ?? b.nombre, "es");
  return [...empiezan.sort(alfabetico), ...contienen.sort(alfabetico)].slice(0, limite);
}
