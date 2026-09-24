:- ensure_loaded(fichas).
:- ensure_loaded(juegos).
:- ensure_loaded(orden).
:- ensure_loaded(victoria).
:- ensure_loaded(situacion).

%* ===================== Yakus =====================
%! yaku(?Yaku, +Victoria, +Situacion) is semidet.
%* Relaciona yakus que aplican a esta victoria bajo esta situación.
%* No se concierne con la compatibilidad de yakus: e.g. una mano con ryanpeikou 
%* sigue teniendo el yaku iipeikou.
% TODO manejar compatibilidad posteriormente.
%* victoria/3 y situacion/3 se documentan en victoria.pl y situacion.pl.
:- discontiguous yaku/3.

%* ===================== Iipeikou (Pure Double Sequence) =====================
yaku(iipeikou, victoria(Formas, _, _), _) :- 
    manoCerrada(Formas),
    select(escC(A1,A2,A3), Formas, RestoFormas),
    member(escC(B1,B2,B3), RestoFormas),
    A1 === B1, A2 === B2, A3 === B3.

%* ===================== Ryanpeikou (Twice Pure Double Sequences) =====================
yaku(ryanpeikou, victoria(Formas, _, _), _) :- 
    manoCerrada(Formas),
    select(escC(A1,A2,A3), Formas, FormasSin1),
    select(escC(B1,B2,B3), FormasSin1, FormasSin2),
    A1 === B1, A2 === B2, A3 === B3,
    select(escC(C1,C2,C3), FormasSin2, FormasSin3),
    member(escC(D1,D2,D3), FormasSin3),
    C1 === D1, C2 === D2, C3 === D3.

%* ===================== Pinfu (All Sequences) =====================
yaku(pinfu, victoria(Formas, FichaGanadora, _), Situacion) :-
    manoCerrada(Formas),
    formaDePinfu(Formas, FichaGanadora, Situacion).

%! formaDePinfu(+Formas, +FichaGanadora, +Situacion) is semidet.
%* Corrobora la forma de pinfu (solo secuencias, par sin valor, espera
%* ryanmen) SIN exigir mano cerrada. yaku(pinfu, ...) sí la exige (pinfu
%* deja de ser yaku si la mano está abierta), pero puntuacion.pl (ver
%* fu/7) también necesita reconocer esta forma en manos abiertas para el
%* caso especial de "pinfu abierto" (0 fu de composición, +2 fu fijos para
%* redondear a 30).
formaDePinfu(Formas, FichaGanadora, situacion(VientoRonda, VientoJugador, _, _, _)) :-
    % solo secuencias => no hay triplas y forma normal
    findall(F, (member(F, Formas), escalera(F)), Escaleras),
    length(Escaleras, 4),
    % par sin valor
    member(pareja(F1, _), Formas),
    vientoCorrespondiente(FichaVientoRonda, VientoRonda),
    vientoCorrespondiente(FichaVientoJugador, VientoJugador),
    \+ member(F1, [g,r,wh,FichaVientoRonda,FichaVientoJugador]),
    % espera ryanmen (para ESTA descomposicón en formas particular)
    esperaRyanmen(Formas, FichaGanadora).

%* ===================== Sanshoku Doujun (Three Colored Sequences) =====================
yaku(sanshokuDoujun, victoria(Formas, _, _), _) :- 
    % probamos todas las numeraciones de escaleras posibles. 
    between(1, 7, NumeroInicioEscaleras),
    NumeroMedioEscaleras is NumeroInicioEscaleras + 1,
    NumeroFinEscaleras is NumeroMedioEscaleras + 1,
    NumerosEscaleras = [NumeroInicioEscaleras, NumeroMedioEscaleras, NumeroFinEscaleras],
    
    % buscamos a ver si tenemos una escalera en esos numeros para cada palo:
    escaleraDeNumerosYPalo(Formas, NumerosEscaleras, man),
    escaleraDeNumerosYPalo(Formas, NumerosEscaleras, pin),
    escaleraDeNumerosYPalo(Formas, NumerosEscaleras, sou).

%* ===================== Ittsuu (Pure Straight) =====================
yaku(ittsuu, victoria(Formas, _, _), _) :- 
    % probamos todos los palos donde podríamos tener un ittsuu. 
    member(Palo, [man,pin,sou]),

    % buscamos a ver si tenemos las tres escaleras en este palo:
    escaleraDeNumerosYPalo(Formas, [1,2,3], Palo),
    escaleraDeNumerosYPalo(Formas, [4,5,6], Palo),
    escaleraDeNumerosYPalo(Formas, [7,8,9], Palo).

%* ===================== Tanyao (All Simples) =====================
yaku(tanyao, victoria(Formas, _, _), _) :- 
    todasLasFichas(Formas, Fichas),
    \+ (member(F, Fichas), \+ simple(F)).

%* ===================== Bakazehai (Prevalent Wind - Yakuhai) =====================
yaku(bakazehai, victoria(Formas, _, _), situacion(VientoRonda, _, _, _, _)) :-
    member(PiernaVientoRonda, Formas),
    pierna(PiernaVientoRonda), % es una pierna (tripla o quad),
    PiernaVientoRonda =.. [_, FichaPiernaVientoRonda | _],
    vientoCorrespondiente(FichaPiernaVientoRonda, VientoRonda). % está compuesto de las fichas del viento prevalente.

%* ===================== Jikazehai (Round Wind - Yakuhai) =====================
yaku(jikazehai, victoria(Formas, _, _), situacion(_, VientoJugador, _, _, _)) :-
    member(PiernaVientoJugador, Formas),
    pierna(PiernaVientoJugador), % es una pierna (tripla o quad),
    PiernaVientoJugador =.. [_, FichaPiernaVientoJugador | _],
    vientoCorrespondiente(FichaPiernaVientoJugador, VientoJugador). % está compuesto de las fichas del viento del jugador.

%* ===================== Sangenpai (Dragon - Yakuhai) =====================
yaku(chun, victoria(Formas, _, _), _) :- 
    member(PiernaDragonRojo, Formas),
    pierna(PiernaDragonRojo), % es una pierna (tripla o quad),
    PiernaDragonRojo =.. [_, r | _]. % está compuesto de dragones rojos
yaku(hatsu, victoria(Formas, _, _), _) :- 
    member(PiernaDragonVerde, Formas),
    pierna(PiernaDragonVerde), % es una pierna (tripla o quad),
    PiernaDragonVerde =.. [_, g | _]. % está compuesto de dragones verdes
yaku(haku, victoria(Formas, _, _), _) :- 
    member(PiernaDragonBlanco, Formas),
    pierna(PiernaDragonBlanco), % es una pierna (tripla o quad),
    PiernaDragonBlanco =.. [_, wh | _]. % está compuesto de dragones blancos

%* ===================== Shousangen (Little Three Dragons) =====================
yaku(shousangen, victoria(Formas, _, _), _) :- 
    % tenemos un par de dragones:
    select(ParDragon, Formas, FormasSin1),
    par(ParDragon),
    ParDragon =.. [_, FichaParDragon | _],
    dragon(FichaParDragon),
    % tenemos una pierna (tripla/quad) de dragones:
    select(PiernaDragonA, FormasSin1, FormasSin2),
    pierna(PiernaDragonA),
    PiernaDragonA =.. [_, FichaPiernaDragonA | _],
    dragon(FichaPiernaDragonA),
    % tenemos otra pierna (tripla/quad) de dragones:
    member(PiernaDragonB, FormasSin2),
    pierna(PiernaDragonB),
    PiernaDragonB =.. [_, FichaPiernaDragonB | _],
    dragon(FichaPiernaDragonB).

%* ===================== Daisangen (Big Three Dragons) =====================
yaku(daisangen, victoria(Formas, _, _), _) :- 
    % tenemos una primera pierna (tripla/quad) de dragones:
    select(PiernaDragonA, Formas, FormasSin1),
    pierna(PiernaDragonA),
    PiernaDragonA =.. [_, FichaPiernaDragonA | _],
    dragon(FichaPiernaDragonA),
    % tenemos una segunda pierna (tripla/quad) de dragones:
    select(PiernaDragonB, FormasSin1, FormasSin2),
    pierna(PiernaDragonB),
    PiernaDragonB =.. [_, FichaPiernaDragonB | _],
    dragon(FichaPiernaDragonB),
    % tenemos una tercera pierna (tripla/quad) de dragones:
    member(PiernaDragonC, FormasSin2),
    pierna(PiernaDragonC),
    PiernaDragonC =.. [_, FichaPiernaDragonC | _],
    dragon(FichaPiernaDragonC).

%* ===================== Shousuushii (Little Four Winds) =====================
yaku(shousuushii, victoria(Formas, _, _), _) :- 
    % tenemos un par de viento:
    select(ParViento, Formas, FormasSin1),
    par(ParViento),
    ParViento =.. [_, FichaParViento | _],
    viento(FichaParViento),
    % tenemos una primera pierna (tripla/quad) de viento:
    select(PiernaVientoA, FormasSin1, FormasSin2),
    pierna(PiernaVientoA),
    PiernaVientoA =.. [_, FichaPiernaVientoA | _],
    viento(FichaPiernaVientoA),
    % tenemos una segunda pierna (tripla/quad) de viento:
    select(PiernaVientoB, FormasSin2, FormasSin3),
    pierna(PiernaVientoB),
    PiernaVientoB =.. [_, FichaPiernaVientoB | _],
    viento(FichaPiernaVientoB),
    % tenemos una tercera pierna (tripla/quad) de viento:
    member(PiernaVientoC, FormasSin3),
    pierna(PiernaVientoC),
    PiernaVientoC =.. [_, FichaPiernaVientoC | _],
    viento(FichaPiernaVientoC).

%* ===================== Daisuushii (Big Four Winds) =====================
yaku(daisuushii, victoria(Formas, _, _), _) :- 
    % tenemos una primera pierna (tripla/quad) de viento:
    select(PiernaVientoA, Formas, FormasSin1),
    pierna(PiernaVientoA),
    PiernaVientoA =.. [_, FichaPiernaVientoA | _],
    viento(FichaPiernaVientoA),
    % tenemos una segunda pierna (tripla/quad) de viento:
    select(PiernaVientoB, FormasSin1, FormasSin2),
    pierna(PiernaVientoB),
    PiernaVientoB =.. [_, FichaPiernaVientoB | _],
    viento(FichaPiernaVientoB),
    % tenemos una tercera pierna (tripla/quad) de viento:
    select(PiernaVientoC, FormasSin2, FormasSin3),
    pierna(PiernaVientoC),
    PiernaVientoC =.. [_, FichaPiernaVientoC | _],
    viento(FichaPiernaVientoC),
    % tenemos una cuarta pierna (tripla/quad) de viento:
    member(PiernaVientoD, FormasSin3),
    pierna(PiernaVientoD),
    PiernaVientoD =.. [_, FichaPiernaVientoD | _],
    viento(FichaPiernaVientoD).

%* ===================== Chanta (Terminals & Honors Everywhere) =====================
yaku(chanta, victoria(Formas, _, _), _) :- 
    maplist(algunaFichaCumple(noSimple), Formas).

%* ===================== Junchan (Terminals Everywhere) =====================
yaku(junchan, victoria(Formas, _, _), _) :- 
    maplist(algunaFichaCumple(terminal), Formas).

%* ===================== Honroutou (All Terminals & Honors) =====================
yaku(honroutou, victoria(Formas, _, _), _) :- 
    maplist(todaFichaCumple(noSimple), Formas).

%* ===================== Chinroutou (All Terminals) =====================
yaku(chinroutou, victoria(Formas, _, _), _) :- 
    maplist(todaFichaCumple(terminal), Formas).

%* ===================== Tsuuiisou (All Honors) =====================
yaku(tsuuiisou, victoria(Formas, _, _), _) :- 
    maplist(todaFichaCumple(honor), Formas).

%* ===================== Kokushi Musou (Thirteen Orphans) =====================
yaku(kokushiMusou, victoria([FormaHuerfanos], _, _), _) :- 
    kokushi(FormaHuerfanos).

%* ===================== Kokushi Musou Juusanmen (Thirteen-Sided Wait) =====================
%* Doble yakuman (ver yakumanDoble/1 en yakus_aplicables.pl): antes de la
%* ficha ganadora la mano ya tenía los trece huérfanos, uno de cada uno,
%* así que esperaba cualquiera de los trece. Equivale a que la ficha
%* ganadora sea justamente la repetida de huerfanos/14. Reemplaza a
%* kokushiMusou (ver anula/2).
yaku(kokushiMusouJuusanmen, victoria([FormaHuerfanos], FichaGanadora, _), _) :-
    once(kokushi(FormaHuerfanos)),
    fichasDeForma(FormaHuerfanos, Fichas),
    once(( select(FichaGanadora, Fichas, FichasSinGanadora),
           memberchk(FichaGanadora, FichasSinGanadora) )).

%* ===================== Chiitoitsu (Seven Pairs) =====================
yaku(chiitoitsu, victoria(Formas, _, _), _) :- 
    length(Formas, 7),
    maplist(par, Formas).

%* ===================== Toitoi (All Triplets) =====================
yaku(toitoi, victoria(Formas, _, _), _) :- 
    findall(F, (member(F, Formas), pierna(F)), Piernas),
    length(Piernas, 4).

%* ===================== San'Ankou (Three Concealed Triplets) =====================
yaku(sanAnkou, victoria(Formas, FichaGanadora, ModoVictoria), _) :-
    piernasOcultasParaAnkou(Formas, FichaGanadora, ModoVictoria, PiernasOcultas),
    length(PiernasOcultas, 3).

%* ===================== Suu'Ankou (Four Concealed Triplets) =====================
yaku(suuAnkou, victoria(Formas, FichaGanadora, ModoVictoria), _) :-
    piernasOcultasParaAnkou(Formas, FichaGanadora, ModoVictoria, PiernasOcultas),
    length(PiernasOcultas, 4).

%* ===================== Suu'Ankou Tanki (Four Concealed Triplets, Single Wait) =====================
%* Doble yakuman (ver yakumanDoble/1 en yakus_aplicables.pl): las cuatro
%* piernas ya estaban ocultas y completas antes de ganar, y la ficha
%* ganadora completó el par (espera tanki). Como la ficha ganadora entra al
%* par, ninguna pierna se completa con ella, así que da igual si fue ron o
%* tsumo. No hay ambigüedad posible sobre a qué Forma entró: si el valor
%* de la ficha ganadora estuviera también en una pierna, la mano tendría
%* cinco fichas iguales. Reemplaza a suuAnkou (ver anula/2); un suu'ankou
%* por tsumo con espera shanpon sigue siendo suuAnkou simple, y por ron con
%* espera shanpon ni siquiera es suuAnkou (ver piernasOcultasParaAnkou/4).
yaku(suuAnkouTanki, victoria(Formas, FichaGanadora, _), _) :-
    once(( member(Par, Formas), par(Par) )),
    fichasDeForma(Par, FichasPar),
    memberchk(FichaGanadora, FichasPar),
    findall(F, (member(F, Formas), pierna(F), oculta(F)), PiernasOcultas),
    length(PiernasOcultas, 4).

%* ===================== Sanshoku Doukou (Three Colored Triplets) =====================
yaku(sanshokuDoukou, victoria(Formas, _, _), _) :-
    % probamos todas las numeraciones: 
    between(1, 9, NumeroPiernas),
    
    % buscamos a ver si tenemos una escalera en esos numeros para cada palo:
    triplaDeNumeroYPalo(Formas, NumeroPiernas, man),
    triplaDeNumeroYPalo(Formas, NumeroPiernas, pin),
    triplaDeNumeroYPalo(Formas, NumeroPiernas, sou).

%* ===================== San'Kantsu (Three Quads) =====================
yaku(sanKantsu, victoria(Formas, _, _), _) :- 
    findall(F, (member(F, Formas), quad(F)), Quads),
    length(Quads, 3).

%* ===================== Suu'Kantsu (Four Quads) =====================
yaku(suuKantsu, victoria(Formas, _, _), _) :- 
    findall(F, (member(F, Formas), quad(F)), Quads),
    length(Quads, 4).

%* ===================== Honitsu (Half Flush) =====================
yaku(honitsu, victoria(Formas, _, _), _) :-
    member(PaloValido, [man,pin,sou]), % palo a probar para el honitsu
    maplist(todaFichaDePaloEn([PaloValido, honor]), Formas).

%* ===================== Chinitsu (Full Flush) =====================
yaku(chinitsu, victoria(Formas, _, _), _) :- 
    member(PaloValido, [man,pin,sou]), % palo a probar para el chinitsu
    maplist(todaFichaCumple(palo(PaloValido)), Formas).

%* ===================== Ryuuiisou (All Green) =====================
yaku(ryuuiisou, victoria(Formas, _, _), _) :- 
    maplist(todaFichaCumple(validaParaRyuuiisou), Formas).

%* ===================== Chuuren Poutou (Nine Gates) =====================
yaku(chuurenPoutou, victoria(Formas, _, _), _) :- 
    manoCerrada(Formas),
    member(PaloValido, [man,pin,sou]), % elegimos el palo para el Chuuren Poutou
    maplist(todaFichaCumple(palo(PaloValido)), Formas), % todas del mismo palo
    todasLasFichas(Formas, Fichas),
    length(Fichas, 14), % no hay kans cerrados
    maplist(numero, NumerosFichas, Fichas),
    msort(NumerosFichas, NumerosFichasOrdenados),
    % la mano base (1,1,1,2,3,4,5,6,7,8,9,9,9) más una ficha extra
    % (cualquier número del 1 al 9, la decimocuarta ficha ganadora):
    member(NumeroExtra, [1,2,3,4,5,6,7,8,9]),
    msort([NumeroExtra, 1,1,1,2,3,4,5,6,7,8,9,9,9], NumerosFichasOrdenados).

%* ===================== Junsei Chuuren Poutou (Pure Nine Gates) =====================
%* Doble yakuman (ver yakumanDoble/1 en yakus_aplicables.pl): chuuren
%* poutou en el que la ficha extra (la decimocuarta, ver arriba) es
%* justamente la ganadora, es decir, antes de ganar la mano era
%* exactamente 1112345678999 y esperaba cualquiera de los nueve números.
%* Reemplaza a chuurenPoutou (ver anula/2).
yaku(junseiChuurenPoutou, victoria(Formas, FichaGanadora, ModoVictoria), Situacion) :-
    once(yaku(chuurenPoutou, victoria(Formas, FichaGanadora, ModoVictoria), Situacion)),
    todasLasFichas(Formas, Fichas),
    maplist(numero, NumerosFichas, Fichas),
    msort(NumerosFichas, NumerosFichasOrdenados),
    numero(NumeroGanador, FichaGanadora),
    msort([NumeroGanador, 1,1,1,2,3,4,5,6,7,8,9,9,9], NumerosFichasOrdenados).



%* ===================== Riichi (Ready) =====================
yaku(riichi, _, situacion(_, _, _, _, Flags)) :- 
    member(riichi, Flags).

%* ===================== Double Riichi (Double Ready) =====================
yaku(dobleRiichi, _, situacion(_, _, _, _, Flags)) :- 
    member(dobleRiichi, Flags).

%* ===================== Open Riichi (Riichi Abierto) =====================
%* Riichi declarado mostrando la mano: reemplaza al riichi común (los flags
%* riichi, dobleRiichi y riichiAbierto son excluyentes, ver situacion.pl),
%* así que nunca se cuenta junto con riichi ni con dobleRiichi.
yaku(riichiAbierto, _, situacion(_, _, _, _, Flags)) :-
    member(riichiAbierto, Flags).

%! yakuDeRegla(?Regla, ?Yaku, +Victoria, +Situacion) is nondet.
%* Como yaku/3, pero para los yakus que solo existen bajo alguna regla de
%* la casa (ver reglas.pl): relaciona Yaku con una Victoria y una Situacion
%* solo si Regla está entre las Reglas de la partida (eso lo decide
%* yakusAplicables/4, en yakus_aplicables.pl).
%* riichiAbiertoRon: con la regla riichiAbiertoRonYakuman, el riichi
%* abierto ganado por ron es yakuman (ver yakuman/1). No hace falta
%* quitar riichiAbierto: como todo yakuman, anula a los yakus que no lo son
%* (ver anula/2).
yakuDeRegla(riichiAbiertoRonYakuman, riichiAbiertoRon, victoria(_, _, ron), situacion(_, _, _, _, Flags)) :-
    member(riichiAbierto, Flags).

%* ===================== Ippatsu (One-shot) =====================
yaku(ippatsu, _, situacion(_, _, _, _, Flags)) :- 
    member(ippatsu, Flags).
    
%* ===================== Menzen Tsumo (Fully Concealed Hand) =====================
yaku(menzenTsumo, victoria(Formas, _, tsumo), _) :- 
    manoCerrada(Formas).
    
%* ===================== Haitei Raoyue (Under the Sea) =====================
%* Haitei es robar la última ficha del muro vivo: solo puede darse por tsumo.
yaku(haitei, victoria(_, _, tsumo), situacion(_, _, _, _, Flags)) :-
    member(haitei, Flags).

%* ===================== Houtei Raoyui (Under the River) =====================
%* Houtei es robar el último descarte de la ronda: solo puede darse por ron.
yaku(houtei, victoria(_, _, ron), situacion(_, _, _, _, Flags)) :-
    member(houtei, Flags).

%* ===================== Rinshan Kaihou (After a Kan) =====================
%* Rinshan es ganar con la ficha de reemplazo robada tras cantar un kan
%* propio: solo puede darse por tsumo, y exige que la mano tenga al menos
%* un quad (kanA o kanC). Esto también hace que rinshan sea
%* estructuralmente incompatible con pinfu (que exige puras escaleras) y
%* con chiitoitsu (cuyas Formas son siempre siete parejas, nunca un quad),
%* sin necesidad de excluirlos a mano.
yaku(rinshan, victoria(Formas, _, tsumo), situacion(_, _, _, _, Flags)) :-
    member(rinshan, Flags),
    member(Forma, Formas),
    quad(Forma).

%* ===================== Chankan (Robbing a Kan) =====================
%* Chankan es robar la ficha que otro jugador agrega a un pon para formar
%* un kan: solo puede darse por ron. Es incompatible con chiitoitsu: para
%* robar esa ficha habría que completar un par que ya tiene dos fichas
%* con una tercera, lo cual no es un par sino una tripla (y de paso
%* implicaría tener cinco fichas iguales, imposible).
yaku(chankan, victoria(Formas, _, ron), situacion(_, _, _, _, Flags)) :-
    member(chankan, Flags),
    \+ (length(Formas, 7), maplist(par, Formas)).

%* ===================== Tenhou (Blessing of Heaven) =====================
yaku(tenhou, victoria(_, _, tsumo), situacion(_, este, _, _, Flags)) :- 
    member(primeraRonda, Flags).

%* ===================== Chiihou (Blessing of Earth) =====================
yaku(chiihou, victoria(_, _, tsumo), situacion(_, VientoJugador, _, _, Flags)) :- 
    member(primeraRonda, Flags),
    VientoJugador \= este.

%* ===================== Renhou (Blessing of Man) =====================
yaku(renhou, victoria(_, _, ron), situacion(_, VientoJugador, _, _, Flags)) :-
    member(primeraRonda, Flags),
    VientoJugador \= este.

%* ===================== Espera Ryanmen (Two-Sided Wait) =====================
%* No es un yaku en sí: es el tipo de espera que se usa para pinfu y,
%* eventualmente, para el cálculo de fu.

%! esperaRyanmen(+Formas, +FichaGanadora) is semidet.
%* Corrobora que la ficha ganadora haya completado una escalera cerrada
%* (escC) mediante una espera ryanmen: la ficha ganadora es un extremo de
%* la escalera y, del otro extremo, también habría sido posible
%* completarla (a diferencia de kanchan, la espera cerrada por el medio, o
%* penchan, la espera de borde: 1-2 esperando 3, u 8-9 esperando 7).
esperaRyanmen(Formas, FichaGanadora) :-
    member(Forma, Formas),
    \+ llamada(Forma),
    esperaRyanmenEnEscalera(Forma, FichaGanadora).

%! esperaRyanmenEnEscalera(+Forma, +FichaGanadora) is semidet.
%* La ficha ganadora completó el extremo inferior de la escalera: fue
%* ryanmen salvo que la escalera sea 7-8-9 (ahí solo se podía completar
%* por abajo, con el 7; espera penchan).
esperaRyanmenEnEscalera(escC(FichaGanadora, _, F3), FichaGanadora) :-
    numero(N3, F3), N3 \== 9.
%* La ficha ganadora completó el extremo superior de la escalera: fue
%* ryanmen salvo que la escalera sea 1-2-3 (ahí solo se podía completar
%* por arriba, con el 3; espera penchan).
esperaRyanmenEnEscalera(escC(F1, _, FichaGanadora), FichaGanadora) :-
    numero(N1, F1), N1 \== 1.

%* ===================== Auxiliares =====================
%! manoCerrada(+Formas) is semidet.
%* Relaciona manos (definida como una lista de Formas que la componen)
%* que estén cerradas; es decir, no hayan realizado llamadas.
%* Recordar que ganar por ron no anula una mano cerrada.
manoCerrada(Formas) :- \+ (member(Forma, Formas), llamada(Forma)).


todaFichaDePaloEn(ListaPalos, Forma) :-
    member(PaloAProbar, ListaPalos),
    todaFichaCumple(palo(PaloAProbar), Forma).

%! piernasOcultasParaAnkou(+Formas, +FichaGanadora, +ModoVictoria, -PiernasOcultas) is nondet.
%* Relaciona Formas con la lista de piernas (tripla/quad) que cuentan como
%* concealed para san'ankou/suu'ankou.
%* Por tsumo no hay ambigüedad: todas las piernas oculta/1 cuentan, ya que
%* la ficha ganadora siempre se robó uno mismo.
%* Por ron sí la hay: FormasGanadoras no registra qué instancia concreta
%* de una ficha es la ganadora, solo su valor (ver el comentario de
%* manoGanadora/2 en forma_mano_ganadora.pl), así que no podemos saber a
%* cuál Forma "entró" realmente. En cambio, probamos —de forma nondet—
%* cada Forma cuya lista de fichas incluya un valor igual al de
%* FichaGanadora como candidata a haberla recibido, y la excluimos del
%* conteo en ese intento. Como yaku/3 es nondet, alcanza con que UNA
%* asignación deje la cantidad de piernas ocultas necesaria: el jugador
%* siempre puede quedarse con la interpretación que más le convenga. Un
%* quad NUNCA es candidato: un kan siempre está completo antes de ganar
%* (se declara aparte, ya sea ankan o robando/completando un pon), nunca
%* se termina de formar con la ficha ganadora, ni por ron ni por tsumo.
piernasOcultasParaAnkou(Formas, _, tsumo, PiernasOcultas) :-
    findall(F, (member(F, Formas), pierna(F), oculta(F)), PiernasOcultas).
piernasOcultasParaAnkou(Formas, FichaGanadora, ron, PiernasOcultas) :-
    member(FormaGanadora, Formas),
    \+ quad(FormaGanadora),
    fichasDeForma(FormaGanadora, FichasFormaGanadora),
    memberchk(FichaGanadora, FichasFormaGanadora),
    findall(F, (member(F, Formas), pierna(F), oculta(F), F \== FormaGanadora), PiernasOcultas).

%! escaleraDeNumerosYPalo(+Formas, +Numeros, +Palo) is semidet.
%* Relaciona listas de Formas que tengan alguna escalera (abierta o cerrada)
%* de los números y el palo indicado
escaleraDeNumerosYPalo(Formas, Numeros, Palo) :-
    member(Escalera, Formas),
    escalera(Escalera), % es escalera
    fichasDeForma(Escalera, FichasEscalera),
    maplist(numero, Numeros, FichasEscalera), % va en el rango numérico indicado
    FichasEscalera = [FichaEscalera|_],
    palo(Palo, FichaEscalera). % es del palo indicado

%! triplaDeNumeroYPalo(+Formas, +Numero, +Palo) is semidet.
%* Relaciona listas de Formas que tengan alguna pierna (tripla o quad)
%* del número y el palo indicado
triplaDeNumeroYPalo(Formas, Numero, Palo) :-
    member(Pierna, Formas),
    pierna(Pierna), % es pierna (tripla/quad)
    fichasDeForma(Pierna, FichasPierna),
    FichasPierna = [FichaPierna|_],
    palo(Palo, FichaPierna), % es del palo indicado
    numero(Numero, FichaPierna). % es del número indicado

%! algunaFichaCumple(+Predicado, +Forma) is nondet.
%* Predicado de alto orden que relaciona formas que tengan al menos una ficha
%* que cumpla el predicado.
algunaFichaCumple(PredicadoSobreFicha, Forma) :-
    forma(Forma),
    Forma =.. [_ | Fichas],
    member(Ficha, Fichas),
    call(PredicadoSobreFicha, Ficha),
    !.

%! todaFichaCumple(+Predicado, +Forma) is nondet.
%* Predicado de alto orden que relaciona formas cuyas fichas
%* cumplan todas el predicado,
todaFichaCumple(PredicadoSobreFicha, Forma) :-
    forma(Forma),
    Forma =.. [_ | Fichas],
    maplist(PredicadoSobreFicha, Fichas),
    !.