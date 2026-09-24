:- ensure_loaded(fichas).
:- ensure_loaded(juegos).
:- ensure_loaded(formas).
:- ensure_loaded(yakus).
:- ensure_loaded(yakus_aplicables).

%* ===================== Puntuación =====================
%* Calcula han, fu y el pago final a partir de una Victoria (FormasGanadoras,
%* FichaGanadora, ModoVictoria), su Situacion y sus YakusFinales (ver
%* yakus_aplicables.pl). Asume que toda Victoria que llega acá viene de una
%* descomposición válida de manoGanadora/2: a diferencia de otras partes
%* del sistema, este módulo NO llama a victoriaValida/1 como precondición.

%* ===================== Han por Yaku =====================
%! hanYaku(?Yaku, ?HanCerrada, ?HanAbierta) is nondet.
%* Relaciona un yaku (no yakuman; ver yakuman/1 en yakus_aplicables.pl,
%* que se puntúa aparte) con su valor en han según la mano esté cerrada o
%* abierta ("kuisagari": varios yakus valen 1 han menos abiertos). Los
%* yakus que solo pueden darse en mano cerrada (riichi, dobleRiichi,
%* riichiAbierto, ippatsu, menzenTsumo, pinfu, iipeikou, ryanpeikou,
%* chiitoitsu) ya están estructuralmente restringidos a mano cerrada en
%* yaku/3 o en manoGanadora/2, así que HanAbierta nunca se consulta para
%* ellos.
hanYaku(riichi, 1, 1).
hanYaku(dobleRiichi, 2, 2).
hanYaku(riichiAbierto, 2, 2). % bajo la regla riichiAbiertoRonYakuman, por ron es yakuman (riichiAbiertoRon)
hanYaku(ippatsu, 1, 1).
hanYaku(menzenTsumo, 1, 1).
hanYaku(pinfu, 1, 1).
hanYaku(iipeikou, 1, 1).
hanYaku(ryanpeikou, 3, 3).
hanYaku(chiitoitsu, 2, 2).

hanYaku(tanyao, 1, 1).
hanYaku(bakazehai, 1, 1).
hanYaku(jikazehai, 1, 1).
hanYaku(chun, 1, 1).
hanYaku(hatsu, 1, 1).
hanYaku(haku, 1, 1).
hanYaku(haitei, 1, 1).
hanYaku(houtei, 1, 1).
hanYaku(rinshan, 1, 1).
hanYaku(chankan, 1, 1).

hanYaku(sanshokuDoujun, 2, 1).
hanYaku(ittsuu, 2, 1).
hanYaku(chanta, 2, 1).

hanYaku(toitoi, 2, 2).
hanYaku(sanAnkou, 2, 2).
hanYaku(sanKantsu, 2, 2).
hanYaku(shousangen, 2, 2).
hanYaku(honroutou, 2, 2).
hanYaku(sanshokuDoukou, 2, 2).

hanYaku(junchan, 3, 2).
hanYaku(honitsu, 3, 2).

hanYaku(chinitsu, 6, 5).

%! hanDeYaku(+Yaku, +ManoCerrada, -Han) is semidet.
hanDeYaku(Yaku, true, Han) :- hanYaku(Yaku, Han, _).
hanDeYaku(Yaku, false, Han) :- hanYaku(Yaku, _, Han).

%! hanYakusRegulares(+YakusFinales, +ManoCerrada, -Han) is det.
%* Suma el han de todos los YakusFinales que no sean yakuman (ver
%* yakuman/1 en yakus_aplicables.pl; esos se puntúan aparte).
hanYakusRegulares(YakusFinales, ManoCerrada, Han) :-
    findall(H, (member(Y, YakusFinales), \+ yakuman(Y), hanDeYaku(Y, ManoCerrada, H)), Hans),
    sum_list(Hans, Han).

%* ===================== Dora =====================
%! desglosarDoras(+Formas, +Situacion, -HanDora, -HanAkaDora, -HanUraDora) is det.
%* Cuenta, por separado, un han por cada ficha de la mano que coincida
%* (según ===/2) con alguna Dora de Situacion (HanDora), un han por cada
%* red five que tenga la mano (HanAkaDora, "aka dora"), y un han por cada
%* ficha que coincida con alguna UraDora (HanUraDora). Si dos indicadores
%* de dora distinta apuntan al mismo valor de ficha, cada coincidencia
%* cuenta por separado (de ahí que se recorra Doras/UraDoras con member/2
%* en vez de memberchk/2).
desglosarDoras(Formas, situacion(_, _, Doras, UraDoras, _), HanDora, HanAkaDora, HanUraDora) :-
    todasLasFichas(Formas, Fichas),
    contarCoincidencias(Fichas, Doras, HanDora),
    contarCoincidencias(Fichas, UraDoras, HanUraDora),
    findall(_, (member(F, Fichas), redfive(F)), CoincidenciasAka),
    length(CoincidenciasAka, HanAkaDora).

%! contarCoincidencias(+Fichas, +Indicadores, -Cant) is det.
contarCoincidencias(Fichas, Indicadores, Cant) :-
    findall(_, (member(F, Fichas), member(D, Indicadores), F === D), Coincidencias),
    length(Coincidencias, Cant).

%! contarDoras(+Formas, +Situacion, -HanDora) is det.
%* Total de han aportado por dora, aka dora y ura dora juntas (ver
%* desglosarDoras/5): es lo único que necesita puntuacion/6 para el Han
%* total, aunque resultado.pl sí distingue cada componente para mostrarlas
%* por separado.
contarDoras(Formas, Situacion, HanDora) :-
    desglosarDoras(Formas, Situacion, HanDoraPropia, HanAkaDora, HanUraDora),
    HanDora is HanDoraPropia + HanAkaDora + HanUraDora.

%* ===================== Fu =====================
%! fu(+Formas, +FichaGanadora, +ModoVictoria, +ManoCerrada, +YakusFinales, +Situacion, -Fu) is det.
%* Chiitoitsu vale 25 fu fijo. Pinfu por tsumo vale 20 fu fijo (no suma el
%* fu de tsumo habitual). El resto se calcula normalmente y se redondea
%* hacia arriba al múltiplo de 10 más cercano.
%*
%* Nota sobre ambigüedad: igual que en piernasOcultasParaAnkou/4 (ver
%* yakus.pl), FormasGanadoras no registra a qué Forma "entró" realmente la
%* ficha ganadora cuando dos formas comparten un valor de ficha. Acá se
%* prueba, de forma nondet, cada Forma candidata a haberla recibido y se
%* toma la que da más fu (el jugador se queda con la interpretación que
%* más le convenga). Esto se decide de forma independiente de qué
%* interpretación hizo aplicar cada yaku en yakusAplicables/3: no se busca
%* una asignación conjunta óptima entre yakus y fu, es una simplificación
%* consciente.
fu(_, _, _, _, YakusFinales, _, 25) :- memberchk(chiitoitsu, YakusFinales), !.
fu(_, _, tsumo, _, YakusFinales, _, 20) :- memberchk(pinfu, YakusFinales), !.
%* ===================== Pinfu abierto =====================
%* Pinfu deja de ser yaku en una mano abierta (ver yaku(pinfu, ...) en
%* yakus.pl), pero su forma (solo secuencias, par sin valor, espera
%* ryanmen) igual produce 0 fu de composición. Por regla especial (ver
%* riichi.wiki), a esa forma se le otorgan +2 fu fijos —en vez de los que
%* saldrían de fuMomentoDeGanar/3— para que redondee a 30 en lugar de 20.
fu(Formas, FichaGanadora, _, false, _, Situacion, 30) :-
    formaDePinfu(Formas, FichaGanadora, Situacion), !.
fu(Formas, FichaGanadora, ModoVictoria, ManoCerrada, _, Situacion, FuFinal) :-
    aggregate_all(max(FuIntento),
        fuIntento(Formas, FichaGanadora, ModoVictoria, ManoCerrada, Situacion, FuIntento),
        FuMax),
    FuFinal is ceiling(FuMax / 10) * 10.

%! fuIntento(+Formas, +FichaGanadora, +ModoVictoria, +ManoCerrada, +Situacion, -FuTotal) is nondet.
%* FormaGanadora nunca puede ser un quad: un kan siempre está completo
%* antes de ganar (se declara aparte, nunca se termina de formar con la
%* ficha ganadora), así que no es candidato válido a haberla recibido.
fuIntento(Formas, FichaGanadora, ModoVictoria, ManoCerrada, Situacion, FuTotal) :-
    Formas = [Par | Juegos],
    member(FormaGanadora, Formas),
    \+ quad(FormaGanadora),
    fichasDeForma(FormaGanadora, FichasFormaGanadora),
    memberchk(FichaGanadora, FichasFormaGanadora),
    fuPar(Par, Situacion, FuPar),
    findall(FuJ, (member(J, Juegos), fuJuego(J, FormaGanadora, ModoVictoria, FuJ)), FusJuegos),
    sum_list(FusJuegos, FuJuegos),
    fuEspera(FormaGanadora, Par, FichaGanadora, FuEspera),
    fuMomentoDeGanar(ModoVictoria, ManoCerrada, FuMomento),
    FuTotal is 20 + FuPar + FuJuegos + FuEspera + FuMomento.

%! fuPar(+Par, +Situacion, -Fu) is det.
%* +2 si el par es de dragón, +2 más por cada viento (ronda/jugador) que
%* coincida con la ficha del par (así un viento doble suma 4).
fuPar(Par, situacion(VientoRonda, VientoJugador, _, _, _), Fu) :-
    fichasDeForma(Par, [F, _]),
    ( dragon(F) -> FuDragon = 2 ; FuDragon = 0 ),
    ( vientoCorrespondiente(F, VientoRonda) -> FuVR = 2 ; FuVR = 0 ),
    ( vientoCorrespondiente(F, VientoJugador) -> FuVJ = 2 ; FuVJ = 0 ),
    Fu is FuDragon + FuVR + FuVJ.

%! fuJuego(+Juego, +FormaGanadora, +ModoVictoria, -Fu) is det.
%* Las escaleras no dan fu. Las piernas (tripla/quad) dan más fu cuanto
%* más cerradas (concealed), más grandes (quad) y con fichas terminales u
%* honores. Una pierna cuenta como abierta si es llamada/1, o si se
%* completó por ron con la ficha ganadora (ver el comentario de fu/7).
fuJuego(Juego, _, _, 0) :- escalera(Juego), !.
fuJuego(Juego, FormaGanadora, ModoVictoria, Fu) :-
    pierna(Juego), !,
    ( quad(Juego) -> BaseQuad = 8 ; BaseQuad = 2 ),
    fichasDeForma(Juego, [F | _]),
    ( noSimple(F) -> MultTH = 2 ; MultTH = 1 ),
    ( ( llamada(Juego) ; (ModoVictoria == ron, Juego == FormaGanadora) ) -> MultAbierto = 1 ; MultAbierto = 2 ),
    Fu is BaseQuad * MultAbierto * MultTH.

%! fuEspera(+FormaGanadora, +Par, +FichaGanadora, -Fu) is det.
%* Tanki (la ficha ganadora completa el par): +2. Ryanmen (ver
%* esperaRyanmenEnEscalera/2 en yakus.pl): +0. Kanchan o penchan (una
%* escalera que no es ryanmen): +2. Shanpon o pierna recién completada: +0.
fuEspera(FormaGanadora, Par, _, 2) :- FormaGanadora == Par, !.
fuEspera(FormaGanadora, _, FichaGanadora, 0) :-
    escalera(FormaGanadora), esperaRyanmenEnEscalera(FormaGanadora, FichaGanadora), !.
fuEspera(FormaGanadora, _, _, 2) :- escalera(FormaGanadora), !.
fuEspera(FormaGanadora, _, _, 0) :- pierna(FormaGanadora), !.

%! fuMomentoDeGanar(+ModoVictoria, +ManoCerrada, -Fu) is det.
%* +2 por ganar de tsumo. +10 por ganar de ron con mano cerrada (menzen
%* ron). Ron con mano abierta no suma nada acá.
fuMomentoDeGanar(tsumo, _, 2).
fuMomentoDeGanar(ron, true, 10).
fuMomentoDeGanar(ron, false, 0).

%* ===================== Nivel y puntos =====================
%! nombreYakuman(+Multiplicador, -Nombre) is det.
nombreYakuman(1, yakuman).
nombreYakuman(2, dobleYakuman).
nombreYakuman(3, tripleYakuman).
nombreYakuman(N, Nombre) :- N > 3, format(atom(Nombre), '~wxYakuman', [N]).

%! nivelDePuntuacion(+Han, +MultYakuman, -Nivel) is det.
%* Nivel en {yakuman (o dobleYakuman, etc.), kazoeYakuman, sanbaiman,
%* baiman, haneman, mangan, sinNombre}. kazoeYakuman (mano de 13+ han
%* sumando yakus normales, sin ningún yakuman real) se puntúa como un
%* yakuman simple, sin importar cuánto pase de 13 (ver yakus_aplicables.pl).
nivelDePuntuacion(_, MultYakuman, Nivel) :- MultYakuman > 0, !, nombreYakuman(MultYakuman, Nivel).
nivelDePuntuacion(Han, 0, kazoeYakuman) :- Han >= 13, !.
nivelDePuntuacion(Han, 0, sanbaiman) :- Han >= 11, !.
nivelDePuntuacion(Han, 0, baiman) :- Han >= 8, !.
nivelDePuntuacion(Han, 0, haneman) :- Han >= 6, !.
nivelDePuntuacion(5, 0, mangan) :- !.
nivelDePuntuacion(_, 0, sinNombre).

%! basePuntos(+Han, +Fu, +MultYakuman, -Base) is det.
%* Puntos base de los que se derivan los pagos (ver puntosDeVictoria/6).
%* Con 5+ han (o yakuman/kazoeYakuman) el fu no importa: se usan bases
%* fijas por nivel. Con 4 han o menos se usa la fórmula fu*2^(2+han),
%* limitada a 2000 (el tope de mangan; así un 4han40fu o 3han70fu llegan
%* a mangan por fu sin necesitar un caso aparte).
basePuntos(_, _, MultYakuman, Base) :- MultYakuman > 0, !, Base is 8000 * MultYakuman.
basePuntos(Han, _, 0, 8000) :- Han >= 13, !.
basePuntos(Han, _, 0, 6000) :- Han >= 11, !.
basePuntos(Han, _, 0, 4000) :- Han >= 8, !.
basePuntos(Han, _, 0, 3000) :- Han >= 6, !.
basePuntos(5, _, 0, 2000) :- !.
basePuntos(Han, Fu, 0, Base) :-
    Han =< 4,
    BaseCalc is Fu * (2 ** (2 + Han)),
    Base is min(BaseCalc, 2000).

%! puntosDeVictoria(+EsDealerGanador, +ModoVictoria, +Han, +Fu, +MultYakuman, -Pago) is det.
%* Pago = pago(Total) para ron (lo paga quien descartó).
%* Pago = pagoTsumoDealer(PagoCadaUno) si el ganador es el repartidor (los
%* tres rivales pagan lo mismo).
%* Pago = pagoTsumo(PagoNoDealer, PagoDealer) si el ganador no es el
%* repartidor (los no-repartidores pagan PagoNoDealer, el repartidor paga
%* el doble).
puntosDeVictoria(EsDealerGanador, ron, Han, Fu, MultYakuman, pago(Total)) :-
    basePuntos(Han, Fu, MultYakuman, Base),
    ( EsDealerGanador == true -> Factor = 6 ; Factor = 4 ),
    redondearArriba100(Base * Factor, Total).
puntosDeVictoria(true, tsumo, Han, Fu, MultYakuman, pagoTsumoDealer(PagoCadaUno)) :-
    basePuntos(Han, Fu, MultYakuman, Base),
    redondearArriba100(Base * 2, PagoCadaUno).
puntosDeVictoria(false, tsumo, Han, Fu, MultYakuman, pagoTsumo(PagoNoDealer, PagoDealer)) :-
    basePuntos(Han, Fu, MultYakuman, Base),
    redondearArriba100(Base * 1, PagoNoDealer),
    redondearArriba100(Base * 2, PagoDealer).

%! redondearArriba100(+X, -Redondeado) is det.
redondearArriba100(X, R) :- R is integer(ceiling(X / 100)) * 100.

%* ===================== Punto de entrada =====================
%! puntuacion(+Formas, +FichaGanadora, +ModoVictoria, +YakusFinales, +Situacion, -Puntuacion) is det.
%* Puntuacion = puntuacion(Han, Fu, Nivel, Pago). EsDealerGanador se
%* deriva de Situacion: el jugador es repartidor si VientoJugador = este
%* (misma convención que tenhou/chiihou en yakus.pl).
%* Si YakusFinales contiene algún yakuman (ver yakuman/1 en
%* yakus_aplicables.pl), Han es 13 por cada uno (pueden darse varios a la
%* vez) y no se suma nada más: un yakuman anula tanto a los demás yakus
%* como a la dora (ver la nota en yakus_aplicables.pl), y Fu no se calcula
%* (queda en 0, no se usa para puntuar yakuman).
puntuacion(Formas, FichaGanadora, ModoVictoria, YakusFinales, Situacion, puntuacion(Han, Fu, Nivel, Pago)) :-
    Situacion = situacion(_, VientoJugador, _, _, _),
    ( VientoJugador == este -> EsDealer = true ; EsDealer = false ),
    ( manoCerrada(Formas) -> ManoCerrada = true ; ManoCerrada = false ),
    findall(Y, (member(Y, YakusFinales), yakuman(Y)), Yakumans),
    length(Yakumans, MultYakuman),
    ( MultYakuman > 0
    -> Han is 13 * MultYakuman, Fu = 0
    ;  hanYakusRegulares(YakusFinales, ManoCerrada, HanYakus),
       contarDoras(Formas, Situacion, HanDora),
       Han is HanYakus + HanDora,
       fu(Formas, FichaGanadora, ModoVictoria, ManoCerrada, YakusFinales, Situacion, Fu)
    ),
    nivelDePuntuacion(Han, MultYakuman, Nivel),
    puntosDeVictoria(EsDealer, ModoVictoria, Han, Fu, MultYakuman, Pago).
