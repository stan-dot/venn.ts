import { select } from "d3-selection";
import { venn, lossFunction, normalizeSolution, scaleSolution } from "./layout";
import { computeTextCentres, circleFromPath, intersectionAreaPath, wrapText } from "./diagram";


export function VennDiagram() {
  let width = 600, height = 350, padding = 15, duration = 1000, orientation = Math.PI / 2, normalize = true, wrap = true, styled = true, fontSize: number | null = null, orientationOrder = null,
    // mimic the behaviour of d3.scale.category10 from the previous
    // version of d3
    colourMap = {},
    // so this is the same as d3.schemeCategory10, which is only defined in d3 4.0
    // since we can support older versions of d3 as long as we don't force this,
    // I'm hackily redefining below. TODO: remove this and change to d3.schemeCategory10
    colourScheme = [
      "#1f77b4",
      "#ff7f0e",
      "#2ca02c",
      "#d62728",
      "#9467bd",
      "#8c564b",
      "#e377c2",
      "#7f7f7f",
      "#bcbd22",
      "#17becf",
    ], colourIndex = 0, colours = (key) => {
      if (key in colourMap) {
        return colourMap[key];
      }
      const ret = (colourMap[key] = colourScheme[colourIndex]);
      colourIndex += 1;
      if (colourIndex >= colourScheme.length) {
        colourIndex = 0;
      }
      return ret;
    }, layoutFunction = venn, loss = lossFunction;

  function chart(selection) {
    let data = selection.datum();

    // handle 0-sized sets by removing from input
    const toremove = {};
    data.forEach(function (datum) {
      if (datum.size == 0 && datum.sets.length == 1) {
        toremove[datum.sets[0]] = 1;
      }
    });
    data = data.filter(function (datum) {
      return !datum.sets.some(function (set) {
        return set in toremove;
      });
    });

    let circles = {};
    let textCentres = {};

    if (data.length > 0) {
      let solution = layoutFunction(data, { lossFunction: loss });

      if (normalize) {
        solution = normalizeSolution(solution, orientation, orientationOrder);
      }

      circles = scaleSolution(solution, width, height, padding);
      textCentres = computeTextCentres(circles, data);
    }

    // Figure out the current label for each set. These can change
    // and D3 won't necessarily update (fixes https://github.com/benfred/venn.js/issues/103)
    const labels = {};
    data.forEach((datum) => {
      if (datum.label) {
        labels[datum.sets] = datum.label;
      }
    });

    function label(d) {
      if (d.sets in labels) {
        return labels[d.sets];
      }
      if (d.sets.length == 1) {
        return "" + d.sets[0];
      }
    }

    // create svg if not already existing
    selection.selectAll("svg").data([circles]).enter().append("svg");

    const svg = selection
      .select("svg")
      .attr("width", width)
      .attr("height", height);

    // to properly transition intersection areas, we need the
    // previous circles locations. load from elements
    let previous = {}, hasPrevious = false;
    svg.selectAll(".venn-area path").each(function (d) {
      const path = select(this).attr("d");
      if (d.sets.length == 1 && path) {
        hasPrevious = true;
        previous[d.sets[0]] = circleFromPath(path);
      }
    });

    // interpolate intersection area paths between previous and
    // current paths
    const pathTween = (d) => (t) => {
      const c = d.sets.map(newFunction_1());
      return intersectionAreaPath(c);

      function newFunction_1(): any {
        return (set) => {
          let start = previous[set], end = circles[set];
          if (!start) {
            start = { x: width / 2, y: height / 2, radius: 1 };
          }
          if (!end) {
            end = { x: width / 2, y: height / 2, radius: 1 };
          }
          return {
            x: start.x * (1 - t) + end.x * t,
            y: start.y * (1 - t) + end.y * t,
            radius: start.radius * (1 - t) + end.radius * t,
          };
        };
      }
    };

    // update data, joining on the set ids
    const nodes = svg.selectAll(".venn-area").data(data, function (d) {
      return d.sets;
    });

    // create new nodes
    const enter = nodes
      .enter()
      .append("g")
      .attr("class", function (d) {
        return (
          "venn-area venn-" + (d.sets.length == 1 ? "circle" : "intersection")
        );
      })
      .attr("data-venn-sets", function (d) {
        return d.sets.join("_");
      });

    const enterPath = enter.append("path"), enterText = enter
      .append("text")
      .attr("class", "label")
      .text(function (d) {
        return label(d);
      })
      .attr("text-anchor", "middle")
      .attr("dy", ".35em")
      .attr("x", width / 2)
      .attr("y", height / 2);

    // apply minimal style if wanted
    if (styled) {
      enterPath
        .style("fill-opacity", "0")
        .filter(function (d) {
          return d.sets.length == 1;
        })
        .style("fill", function (d) {
          return colours(d.sets);
        })
        .style("fill-opacity", ".25");

      enterText.style("fill", function (d) {
        return d.sets.length == 1 ? colours(d.sets) : "#444";
      });
    }

    // update existing, using pathTween if necessary
    let update = selection;
    if (hasPrevious) {
      update = selection.transition("venn").duration(duration);
      update.selectAll("path").attrTween("d", pathTween);
    } else {
      update.selectAll("path").attr("d", function (d) {
        return intersectionAreaPath(
          d.sets.map(function (set) {
            return circles[set];
          })
        );
      });
    }

    const updateText = update
      .selectAll("text")
      .filter((d) => d.sets in textCentres)
      .text((d) => label(d))
      .attr("x", (d) => Math.floor(textCentres[d.sets].x))
      .attr("y", (d) => Math.floor(textCentres[d.sets].y));

    if (wrap) {
      if (hasPrevious) {
        updateText.on("end", wrapText(circles, label));
      } else {
        updateText.each(wrapText(circles, label));
      }
    }

    // remove old
    const exit = nodes.exit().transition("venn").duration(duration).remove();
    exit.selectAll("path").attrTween("d", pathTween);

    const exitText = exit
      .selectAll("text")
      .attr("x", width / 2)
      .attr("y", height / 2);

    // if we've been passed a fontSize explicitly, use it to
    // transition
    if (fontSize !== null) {
      enterText.style("font-size", "0px");
      updateText.style("font-size", fontSize);
      exitText.style("font-size", "0px");
    }

    return {
      circles: circles,
      textCentres: textCentres,
      nodes: nodes,
      enter: enter,
      update: update,
      exit: exit,
    };
  }

  chart.wrap = function (_) {
    if (!arguments.length) return wrap;
    wrap = _;
    return chart;
  };

  chart.width = function (_) {
    if (!arguments.length) return width;
    width = _;
    return chart;
  };

  chart.height = function (_) {
    if (!arguments.length) return height;
    height = _;
    return chart;
  };

  chart.padding = function (_) {
    if (!arguments.length) return padding;
    padding = _;
    return chart;
  };

  chart.colours = function (_) {
    if (!arguments.length) return colours;
    colours = _;
    return chart;
  };

  chart.fontSize = function (_) {
    if (!arguments.length) return fontSize;
    fontSize = _;
    return chart;
  };

  chart.duration = function (_) {
    if (!arguments.length) return duration;
    duration = _;
    return chart;
  };

  chart.layoutFunction = function (_) {
    if (!arguments.length) return layoutFunction;
    layoutFunction = _;
    return chart;
  };

  chart.normalize = function (_) {
    if (!arguments.length) return normalize;
    normalize = _;
    return chart;
  };

  chart.styled = function (_) {
    if (!arguments.length) return styled;
    styled = _;
    return chart;
  };

  chart.orientation = function (_) {
    if (!arguments.length) return orientation;
    orientation = _;
    return chart;
  };

  chart.orientationOrder = function (_) {
    if (!arguments.length) return orientationOrder;
    orientationOrder = _;
    return chart;
  };

  chart.lossFunction = function (_) {
    if (!arguments.length) return loss;
    loss = _;
    return chart;
  };

  return chart;
}
