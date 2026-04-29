CXX = g++
CXXFLAGS = -std=c++17 -Wall -Wextra -I./libcaption
LDFLAGS = -L./libcaption -lcaption

all: libcaption/libcaption.a generator

libcaption/libcaption.a:
	./build-lib.sh

generator: generator.cpp libcaption/libcaption.a
	$(CXX) $(CXXFLAGS) -o generator generator.cpp $(LDFLAGS)

golden: generator
	./generator

clean:
	rm -f generator
	rm -rf golden

distclean: clean
	rm -rf libcaption

.PHONY: all golden clean distclean
