:- ensure_loaded(fichas).

%* ===================== Orden estándar de fichas =====================
%* man < pin < sou < honor; dentro de honor: vientos antes que dragones,
%* en el orden convencional E, S, W, N y luego blanco, verde, rojo.

ordenTipoPalo(man, 1).
ordenTipoPalo(pin, 2).
ordenTipoPalo(sou, 3).
ordenTipoPalo(honor, 4).

ordenHonor(e, 1).
ordenHonor(s, 2).
ordenHonor(w, 3).
ordenHonor(n, 4).
ordenHonor(wh, 5).
ordenHonor(g, 6).
ordenHonor(r, 7).

%! claveFicha(+F, -Clave) is det.
%* Construye la clave de orden de una ficha: primero el palo, luego el
%* número (o, para honores, su posición convencional), y por último si
%* es red five, para que quede después de su equivalente normal.
claveFicha(F, clave(TipoOrden, Num, EsRedFive)) :-
    palo(Tipo, F),
    ordenTipoPalo(Tipo, TipoOrden),
    ( numero(Num, F) -> true ; ordenHonor(F, Num) ),
    ( redfive(F) -> EsRedFive = 1 ; EsRedFive = 0 ).

%! compararFichas(-Orden, +FI1, +FI2) is det.
%* Compara dos pares Ficha-Indice según la clave de la ficha, usando el
%* índice original como desempate para no perder fichas repetidas.
compararFichas(Orden, F1-I1, F2-I2) :-
    claveFicha(F1, C1),
    claveFicha(F2, C2),
    compare(Orden, C1-I1, C2-I2).

%! ordenarFichas(+Fichas, -FichasOrdenadas) is det.
%* Ordena una lista de fichas según el orden estándar del mahjong,
%* conservando fichas repetidas.
ordenarFichas(Fichas, FichasOrdenadas) :-
    length(Fichas, N),
    numlist(1, N, Indices),
    pairs_keys_values(Pares, Fichas, Indices),
    predsort(compararFichas, Pares, ParesOrdenados),
    pairs_keys(ParesOrdenados, FichasOrdenadas).

%! fichasEnOrden(+Fichas) is nondet.
%* Auxiliar para corroborar si una lista de fichas ya está ordenada.
fichasEnOrden(Fichas) :- ordenarFichas(Fichas, Fichas).