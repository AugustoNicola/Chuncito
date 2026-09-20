:- ensure_loaded(fichas).
:- ensure_loaded(formas).
:- ensure_loaded(forma_mano_ganadora).

%* ===================== Victoria =====================
%* Modela el evento de ganar una mano, independiente de la situación de
%* la partida (a diferencia de situacion/3, ver situacion.pl).

%! victoria(?FormasGanadoras, ?FichaGanadora, ?ModoVictoria) is det.
%* FormasGanadoras es la descomposición de la mano ganadora en un par y
%* cuatro juegos, tal como la produce manoGanadora/2 (ver
%* forma_mano_ganadora.pl): siempre [Par | Juegos], con el par ocupando
%* la primera posición.
%* FichaGanadora es una ficha de alguna Forma no declarada como llamada
%* (el par o un juego cerrado): la ficha ganadora nunca puede venir de
%* una llamada, ya que esas se declaran antes de ganar.
%* ModoVictoria in {ron, tsumo}.

%* ===================== Validación =====================

%! modoVictoriaValido(?ModoVictoria) is nondet.
modoVictoriaValido(ron).
modoVictoriaValido(tsumo).

%! victoriaValida(+Victoria) is semidet.
%* Corrobora que Victoria tenga un ModoVictoria reconocido, que
%* FormasGanadoras sea en efecto un par más cuatro juegos bien formados
%* (ver par/1 y juego/1 en formas.pl), y que FichaGanadora sea una ficha
%* de alguna Forma no declarada como llamada (ver el comentario de
%* victoria/3).
victoriaValida(victoria([Par | Juegos], FichaGanadora, ModoVictoria)) :-
    modoVictoriaValido(ModoVictoria),
    par(Par),
    length(Juegos, 4),
    maplist(juego, Juegos),
    member(FormaCerrada, [Par | Juegos]),
    \+ llamada(FormaCerrada),
    fichasDeForma(FormaCerrada, FichasCerradas),
    memberchk(FichaGanadora, FichasCerradas).
