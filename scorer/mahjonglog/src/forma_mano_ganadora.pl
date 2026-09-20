:- ensure_loaded(juegos).
:- ensure_loaded(orden).
:- ensure_loaded(formas).

%* ===================== Forma de Mano Ganadora =====================

%! manoGanadora(?Mano, ?FormasGanadoras) is nondet.
%* Relaciona Manos que cumplan con la forma de mano ganadora tradicional
%* con FormasGanadoras, la lista de las cinco formas (un par y cuatro
%* juegos) en que se descompuso. Mano = mano(FichasSueltas, Llamadas)
%* (ver victoria.pl). Llamadas son los juegos que hay que pasar ya
%* armados porque no se pueden inferir agrupando FichasSueltas: no solo
%* las llamadas propiamente dichas (chii, pon, kanA; ver llamada/1 en
%* formas.pl), sino también los kanC (ankan): seleccionarJuego/3 solo
%* arma triC/escC de a tres fichas sueltas, así que un kan cerrado
%* SIEMPRE tiene que venir declarado en esta lista para poder alcanzar el
%* resultado final (ver juegoPreformado/1 y resultadoDeVictoria/5 en
%* resultado.pl).
% # Caso Kokushi Musou (Thirteen Orphans)
manoGanadora(mano(FichasSueltas, []), [TerminoHuerfanos]) :-
    ordenarFichas(FichasSueltas, FichasOrdenadas),
    TerminoHuerfanos =.. [huerfanos | FichasOrdenadas],
    kokushi(TerminoHuerfanos).

% # Caso Chiitoitsu (Seven Pairs)
manoGanadora(mano(FichasSueltas, []), Parejas):-
    ordenarFichas(FichasSueltas, FichasOrdenadas),
    armarTodoPares(FichasOrdenadas, Parejas),
    is_set(Parejas). % No puede haber repetidos
    
% # Caso para mano estándar
manoGanadora(mano(FichasSueltas, Llamadas), FormasGanadoras) :-
    ordenarFichas(FichasSueltas, FichasSueltasOrdenadas),
    seleccionarPar(FichasSueltasOrdenadas, RestoFichasSueltas, Par), % el par nunca viene de las llamadas
    compuestaPorJuegos(mano(RestoFichasSueltas, Llamadas), 4, Juegos),
    FormasGanadoras = [Par | Juegos].


armarTodoPares([], []).
armarTodoPares([F1, F2 | RestoFichas], [pareja(F1,F2) | RestoParejas]) :-
    par(pareja(F1, F2)),
    armarTodoPares(RestoFichas, RestoParejas).

%! todasLasFichas(+FormasGanadoras, -Fichas) is det.
%* Relaciona FormasGanadoras con la lista de todas sus fichas.
todasLasFichas(FormasGanadoras, Fichas) :-
    maplist(fichasDeForma, FormasGanadoras, FichasPorForma),
    append(FichasPorForma, Fichas).

%! fichasDeForma(+Forma, -Fichas) is det.
%* Relaciona una Forma (pareja, chii, pon, escC, triC, kanA o kanC) con
%* la lista de fichas que la componen.
fichasDeForma(Forma, Fichas) :- Forma =.. [_ | Fichas].

%! seleccionarPar(?Fichas, ?RestoFichas, ?Par) is nondet.
%* Relaciona una lista ordenada de fichas con RestoFichas y Par tales que
%* RestoFichas más Par conforman Fichas. Como Fichas está ordenada, las
%* fichas que forman un par quedan siempre adyacentes; así se evita
%* encontrar el mismo par dos veces (una por cada orden de selección de
%* sus fichas).
seleccionarPar(Fichas, RestoFichas, pareja(F1, F2)) :-
    append(Antes, [F1, F2 | Despues], Fichas),
    par(pareja(F1, F2)),
    append(Antes, Despues, RestoFichas).

%! compuestaPorJuegos(?Mano, +CantJuegos, ?Juegos) is nondet.
%* Relaciona una Mano con CantJuegos y Juegos, la lista de los CantJuegos
%* juegos que la componen, si la mano está compuesta exactamente de esa
%* cantidad de juegos, sin fichas sobrantes ni intersecciones. Considera
%* tanto las fichas sueltas como los juegos ya declarados en Llamadas
%* (que pasan a Juegos sin modificar; ver juegoPreformado/1).
compuestaPorJuegos(mano([], []), 0, []).
compuestaPorJuegos(mano(FichasSueltas, [Llamada | RestoLlamadas]), CantJuegos, [Llamada | RestoJuegos]) :-
    CantJuegos > 0,
    juegoPreformado(Llamada),
    CantJuegosRestante is CantJuegos - 1,
    compuestaPorJuegos(mano(FichasSueltas, RestoLlamadas), CantJuegosRestante, RestoJuegos).
compuestaPorJuegos(mano(FichasSueltas, []), CantJuegos, [Juego | RestoJuegos]) :-
    CantJuegos > 0,
    seleccionarJuego(FichasSueltas, RestoFichasSueltas, Juego),
    CantJuegosRestante is CantJuegos - 1,
    compuestaPorJuegos(mano(RestoFichasSueltas, []), CantJuegosRestante, RestoJuegos).

%! juegoPreformado(+Juego) is semidet.
%* Corrobora que Juego sea un juego que tiene que llegar ya armado dentro
%* de Llamadas (ver el comentario de manoGanadora/2): una llamada
%* propiamente dicha (chii, pon o kanA; ver llamada/1 en formas.pl) o un
%* kanC (ankan), que tampoco se puede inferir agrupando fichas sueltas de
%* a tres. El corte evita contar kanA dos veces (es tanto llamada/1 como
%* quad/1).
juegoPreformado(Juego) :- llamada(Juego), !.
juegoPreformado(Juego) :- quad(Juego).

%! seleccionarJuego(?Fichas, ?RestoFichas, ?Juego) is nondet.
%* Relaciona una lista ordenada de fichas con RestoFichas y Juego (escC o
%* triC) tales que RestoFichas más las fichas de Juego conforman Fichas.
%* Usa combinacionUnica/4 en lugar de encadenar select/3: como
%* fichasDeTripla/3 y fichasDeEscalera/3 no dependen del orden de sus
%* argumentos, elegir F2,F3 con select/3 encontraba cada trío válido hasta
%* 6 veces (una por permutación). combinacionUnica/4 genera cada trío de
%* fichas una única vez, incluso cuando ColaFichas tiene fichas repetidas
%* en distintas posiciones (p. ej. dos m4 y dos m5): a diferencia de
%* combinacion/4 (que genera una combinación por cada combinación de
%* POSICIONES), combinacionUnica/4 filtra las que coinciden en VALOR.
%* Además, fuerza a que la primera ficha de la lista participe del juego
%* elegido: así, en compuestaPorJuegos/3, cada partición en juegos se
%* encuentra una única vez (por el juego que contiene la ficha más a la
%* izquierda) en vez de una vez por cada orden posible de extracción.
seleccionarJuego([F1 | ColaFichas], RestoFichas, escC(F1, F2, F3)) :-
    combinacionUnica(2, ColaFichas, [F2, F3], RestoFichas),
    escalera(escC(F1, F2, F3)).
seleccionarJuego([F1 | ColaFichas], RestoFichas, triC(F1, F2, F3)) :-
    combinacionUnica(2, ColaFichas, [F2, F3], RestoFichas),
    tripla(triC(F1, F2, F3)).
